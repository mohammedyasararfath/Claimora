// POST /functions/v1/ai-agent-turn
// Body: { sessionId: string, message: string }
//
// Server-side reimplementation of the prototype's sendMessage()/buildPrompt()/
// buildTools() loop. Every tool call is executed here, against real Postgres
// tables, inside a trusted (service-role) context — the browser only ever
// sends free-text messages and never a tool result directly, which is what
// makes complete_claim/restricted_claim non-forgeable in production (the
// prototype's version runs entirely in the browser and could be forced to
// call any tool from devtools).
//
// This is intentionally a non-streaming request/response loop for
// correctness and simplicity; swap `client.messages.create` for
// `client.messages.stream()` and proxy chunks as SSE from the Next.js route
// handler if token-by-token streaming becomes a requirement later.

import Anthropic from "npm:@anthropic-ai/sdk@0.32";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_MESSAGES = 24;
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";

const RESTRICTED_LOCK_FIELDS = ["full_name", "license", "reply_to_reviews", "reviews_report"];

type ChatSession = {
  id: string;
  mode: "claim" | "create";
  status: string;
  profile_id: string | null;
  fields: Record<string, unknown>;
  bio_state: { text?: string; status?: string } | null;
  pre_verified: { channel?: string; contact?: string; restricted?: boolean } | string | null;
  claim_source: string | null;
  visitor_user_id: string | null;
  live_request_id: string | null;
};

function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{2})/g, "*");
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "offer_choices",
    description: "Present the visitor a short list of discrete choices to pick from instead of free text.",
    input_schema: {
      type: "object",
      properties: { choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 } },
      required: ["choices"],
    },
  },
  {
    name: "record_intent",
    description: "Record a short label for what the visitor is trying to do in this conversation.",
    input_schema: { type: "object", properties: { intent: { type: "string" } }, required: ["intent"] },
  },
  {
    name: "check_graph_data",
    description: "Look up a field already on file for this profile (claim mode only). Returns a masked value pre-verification, full value post-verification.",
    input_schema: {
      type: "object",
      properties: { field: { type: "string", enum: ["name", "category", "city", "brokerage", "license", "email", "phone"] } },
      required: ["field"],
    },
  },
  {
    name: "record_field",
    description: "Record a field the visitor has told you, to be used later when creating/updating the profile.",
    input_schema: {
      type: "object",
      properties: { field: { type: "string" }, value: { type: "string" } },
      required: ["field", "value"],
    },
  },
  {
    name: "flag_open_question",
    description: "Flag that the visitor asked something you cannot answer confidently from verified data, so it surfaces for human review.",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
  },
  {
    name: "check_email_match",
    description: "Create mode only. Check whether an email the visitor gave matches an existing unclaimed profile (dedupe).",
    input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
  },
  {
    name: "switch_to_claim",
    description: "Create mode only. Switch this session to claim mode against an existing unclaimed profile the visitor just confirmed is theirs.",
    input_schema: { type: "object", properties: { profileId: { type: "string" } }, required: ["profileId"] },
  },
  {
    name: "send_otp",
    description: "Claim mode only, when not already verified. Send a one-time verification code to the visitor's email or phone on file.",
    input_schema: { type: "object", properties: { channel: { type: "string", enum: ["email", "sms"] } }, required: ["channel"] },
  },
  {
    name: "verify_otp",
    description: "Verify the code the visitor just typed against the most recently sent OTP.",
    input_schema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
  },
  {
    name: "propose_bio",
    description: "Propose a short professional bio/profile description for the visitor to accept, edit, or regenerate.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "create_profile",
    description: "Create mode only. Create the new profile row once full_name, category, city, and a contact email or phone are recorded.",
    input_schema: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        category: { type: "string" },
        city: { type: "string" },
        contactEmail: { type: "string" },
        contactPhone: { type: "string" },
      },
      required: ["fullName", "category", "city"],
    },
  },
  {
    name: "complete_claim",
    description: "Finalize the claim/create: creates the visitor's account, assigns profile ownership, and ends the conversation successfully. Requires verification (claim mode) or an accepted bio + contact email (create mode).",
    input_schema: { type: "object", properties: { loginEmail: { type: "string" } }, required: [] },
  },
  {
    name: "restricted_claim",
    description: "Finalize a claim without OTP verification, using an alternate email the visitor provided for manual review. Locks sensitive fields until a human verifies ownership.",
    input_schema: { type: "object", properties: { altEmail: { type: "string" } }, required: ["altEmail"] },
  },
  {
    name: "hand_off",
    description: "Escalate this conversation to a human live agent — required immediately if the visitor says someone else already claimed this profile and it isn't them (an ownership dispute), or on explicit request.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" }, summary: { type: "string" } },
      required: ["reason", "summary"],
    },
  },
];

function systemPrompt(session: ChatSession, profile: Record<string, unknown> | null): string {
  const base = `You are Claimora's profile assistant. Be concise, warm, and factual. Never invent facts about a profile — only state what check_graph_data or record_field has actually returned/recorded. If the visitor claims someone else already has this profile and it isn't them, call hand_off immediately with reason "dispute" rather than trying to resolve it yourself. Write plain conversational text only — the chat UI renders your reply as-is with no markdown support, so never use **bold**, bullet lists, numbered lists, or headings; write short plain sentences instead. When calling record_field, always use these exact snake_case keys where applicable: full_name, category, city, contact_email, contact_phone, login_email — never invent a differently-cased variant of one of these (e.g. never "loginEmail"), since each is shown to the visitor as its own line and a near-duplicate key looks like a bug.`;

  if (session.mode === "create") {
    return `${base}\n\nMode: CREATE — no existing profile matched. Collect full_name, category, city, and a contact email or phone (use record_field for each). If the visitor mentions an email, call check_email_match to see if an unclaimed profile already exists for them — if it does and they confirm it's theirs, call switch_to_claim instead of continuing to create a duplicate. Once you have the required fields, call create_profile, then propose_bio with a short 1-2 sentence professional bio based on what they told you. Once they accept the bio (they'll say so, or you'll be told bioState is accepted), call complete_claim.`;
  }

  const preVerified = session.pre_verified;
  const profileName = (profile?.name as string) ?? "this profile";

  if (preVerified && preVerified !== "restricted" && typeof preVerified === "object") {
    return `${base}\n\nMode: CLAIM (already verified via ${preVerified.channel}) for ${profileName}. Do not ask for OTP verification again. Confirm which login email they want to use, ask for a short bio or accept a proposed one via propose_bio, then call complete_claim.`;
  }

  if (preVerified === "restricted") {
    const knownLoginEmail = session.fields?.login_email as string | undefined;
    const loginEmailNote = knownLoginEmail
      ? ` They already gave their alternate email earlier in this conversation: ${knownLoginEmail} — use that directly as the restricted_claim argument, do not ask for it again.`
      : "";
    return `${base}\n\nMode: CLAIM (restricted — visitor provided an alternate email, no OTP possible) for ${profileName}. Confirm the fields you can (use check_graph_data), explain that name/license/review-reply/review-report will stay locked until a human verifies them, then call restricted_claim with their alternate email. Do not attempt to send an OTP.${loginEmailNote}`;
  }

  return `${base}\n\nMode: CLAIM for ${profileName}, not yet verified. Use check_graph_data to see what channels are on file (masked). Ask the visitor to choose email or phone verification, then call send_otp with that channel. After they reply with a code, call verify_otp. If they say they can't access either channel, ask for an alternate email instead and call restricted_claim with it — do not call send_otp in that case. Once verified, ask for/propose a short bio via propose_bio, then call complete_claim.`;
}

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null; // RAG is optional — falls back to no retrieved context.
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.[0]?.embedding ?? null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { sessionId, message } = await req.json();
    if (!sessionId || !message) {
      return jsonResponse({ error: "sessionId and message are required" }, 400);
    }

    const supabase = supabaseAdmin();
    const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .single<ChatSession>();

    if (sessionError || !session) {
      return jsonResponse({ error: "session not found" }, 404);
    }

    let profile: Record<string, unknown> | null = null;
    if (session.profile_id) {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.profile_id).single();
      profile = data;
    }

    await supabase.from("chat_messages").insert({ session_id: sessionId, sender: "visitor", body: message });

    const { data: history } = await supabase
      .from("chat_messages")
      .select("sender, body")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    const messages: Anthropic.MessageParam[] = (history ?? [])
      .reverse()
      .filter((m) => m.sender === "visitor" || m.sender === "agent")
      .map((m) => ({ role: m.sender === "visitor" ? "user" : "assistant", content: m.body }));

    // Optional RAG grounding: retrieve relevant knowledge chunks for this turn.
    let ragContext = "";
    const embedding = await embedQuery(message);
    if (embedding) {
      const { data: chunks } = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: embedding,
        match_count: 4,
      });
      if (chunks?.length) {
        ragContext = `\n\nRelevant support knowledge (use only if directly relevant, cite nothing, just use the facts):\n${chunks
          .map((c: { content: string }) => `- ${c.content}`)
          .join("\n")}`;
      }
    }

    let openQuestionFlagged = false;
    let handOffPending: { reason: string; summary: string } | null = null;
    let sessionUpdates: Record<string, unknown> = {};
    let fields = { ...(session.fields ?? {}) };

    let iterations = 0;
    let finalText = "";

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt(session, profile) + ragContext,
        tools: TOOLS,
        messages,
      });

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      finalText = textBlocks.map((b) => b.text).join("\n").trim();

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        const input = tool.input as Record<string, unknown>;
        let result: unknown = { ok: true };

        try {
          switch (tool.name) {
            case "offer_choices": {
              result = { presented: input.choices };
              break;
            }
            case "record_intent": {
              sessionUpdates.intent = input.intent;
              result = { recorded: true };
              break;
            }
            case "check_graph_data": {
              if (session.mode !== "claim" || !profile) {
                result = { error: "not applicable outside claim mode" };
                break;
              }
              const fieldMap: Record<string, unknown> = {
                name: profile.name,
                category: profile.category,
                city: profile.city,
                brokerage: profile.brokerage,
                license: profile.license,
                email: profile.email,
                phone: profile.phone_e164,
              };
              const raw = fieldMap[input.field as string];
              const verified = session.pre_verified && session.pre_verified !== "restricted";
              let value = raw ?? "not found";
              if (raw && !verified) {
                if (input.field === "email") value = maskEmail(String(raw));
                if (input.field === "phone") value = maskPhone(String(raw));
              }
              await supabase.from("chat_graph_reads").insert({
                session_id: sessionId,
                field_name: input.field,
                value_returned: String(value),
              });
              result = { field: input.field, value };
              break;
            }
            case "record_field": {
              fields[input.field as string] = input.value;
              result = { recorded: true };
              break;
            }
            case "flag_open_question": {
              openQuestionFlagged = true;
              await supabase.from("chat_open_questions").insert({ session_id: sessionId, topic: input.topic });
              result = { flagged: true };
              break;
            }
            case "check_email_match": {
              const { data: match } = await supabase
                .from("profiles")
                .select("id, name, category, city")
                .eq("email", input.email)
                .eq("status", "unclaimed")
                .maybeSingle();
              result = match ?? { match: null };
              break;
            }
            case "switch_to_claim": {
              sessionUpdates.mode = "claim";
              sessionUpdates.profile_id = input.profileId;
              const { data: switched } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", input.profileId)
                .single();
              profile = switched;
              (session as ChatSession).mode = "claim";
              result = { switched: true };
              break;
            }
            case "send_otp": {
              const res = await fetch(`${requireEnv("SUPABASE_URL")}/functions/v1/otp-issue`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ profileId: session.profile_id, channel: input.channel, sessionId }),
              });
              const json = await res.json();
              if (!res.ok) {
                result = { error: json.error ?? "failed to send code" };
              } else {
                fields._otp_id = json.otpId;
                result = { sent: true, maskedDestination: json.maskedDestination };
              }
              break;
            }
            case "verify_otp": {
              if (!fields._otp_id) {
                result = { error: "no code was sent yet" };
                break;
              }
              const res = await fetch(`${requireEnv("SUPABASE_URL")}/functions/v1/otp-verify`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${requireEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ otpId: fields._otp_id, code: input.code }),
              });
              const json = await res.json();
              if (!res.ok || !json.verified) {
                result = { error: json.error ?? "verification failed" };
              } else {
                sessionUpdates.pre_verified = { channel: json.channel, contact: json.destination };
                result = { verified: true };
              }
              break;
            }
            case "propose_bio": {
              sessionUpdates.bio_state = { text: input.text, status: "proposed" };
              result = { proposed: true };
              break;
            }
            case "create_profile": {
              if (session.mode !== "create") {
                result = { error: "not applicable in claim mode" };
                break;
              }
              const slug = slugify(String(input.fullName));
              const { data: created, error: createError } = await supabase
                .from("profiles")
                .insert({
                  slug,
                  name: input.fullName,
                  category: input.category,
                  city: input.city,
                  email: input.contactEmail ?? null,
                  phone_e164: input.contactPhone ?? null,
                  status: "unclaimed",
                })
                .select("*")
                .single();
              if (createError || !created) {
                result = { error: createError?.message ?? "failed to create profile" };
                break;
              }
              profile = created;
              sessionUpdates.profile_id = created.id;
              if (input.contactEmail) fields.contact_email = input.contactEmail;
              if (input.contactPhone) fields.contact_phone = input.contactPhone;
              result = { profileId: created.id, slug };
              break;
            }
            case "complete_claim": {
              const profileId = (sessionUpdates.profile_id as string) ?? session.profile_id;
              if (!profileId) {
                result = { error: "no profile to claim yet" };
                break;
              }
              const verified = session.mode === "claim" && sessionUpdates.pre_verified;
              const bioAccepted =
                (sessionUpdates.bio_state as { status?: string } | undefined)?.status === "accepted" ||
                session.bio_state?.status === "accepted";
              if (session.mode === "claim" && !verified && !(session.pre_verified && session.pre_verified !== "restricted")) {
                result = { error: "cannot complete_claim: not verified yet" };
                break;
              }
              if (session.mode === "create" && !bioAccepted) {
                result = { error: "cannot complete_claim: bio not accepted yet" };
                break;
              }

              const loginEmail =
                (input.loginEmail as string) ||
                (fields.contact_email as string) ||
                ((sessionUpdates.pre_verified as { contact?: string })?.contact) ||
                (profile?.email as string);

              if (!loginEmail) {
                result = { error: "no email available to create an account" };
                break;
              }

              const { data: created, error: authError } = await supabase.auth.admin.createUser({
                email: loginEmail,
                email_confirm: true,
                user_metadata: { full_name: profile?.name ?? fields.full_name },
              });

              if (authError || !created?.user) {
                result = { error: `could not create account: ${authError?.message ?? "unknown error"}` };
                break;
              }

              const bioText =
                (sessionUpdates.bio_state as { text?: string } | undefined)?.text ?? session.bio_state?.text;

              await supabase
                .from("profiles")
                .update({
                  owner_user_id: created.user.id,
                  status: "claimed",
                  claim_date: new Date().toISOString(),
                  snippet: bioText ?? profile?.snippet,
                  verification_method: session.mode === "claim" ? "email_otp" : null,
                })
                .eq("id", profileId);

              sessionUpdates.status = "claimed";
              sessionUpdates.visitor_user_id = created.user.id;

              const { data: link } = await supabase.auth.admin.generateLink({
                type: "recovery",
                email: loginEmail,
              });

              const resendKey = Deno.env.get("RESEND_API_KEY");
              if (resendKey && link?.properties?.action_link) {
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: Deno.env.get("EMAIL_FROM") ?? "Claimora <no-reply@claimora.app>",
                    to: loginEmail,
                    subject: "Set your Claimora password",
                    html: `<p>Your profile is claimed. <a href="${link.properties.action_link}">Set your password</a> to log in.</p>`,
                  }),
                });
              }

              await supabase.from("agent_events").insert({
                session_id: sessionId,
                surface: session.mode === "claim" ? "Claim agent" : "Create agent",
                outcome: "converted",
              });

              result = { claimed: true, profileId, loginEmail };
              break;
            }
            case "restricted_claim": {
              const profileId = session.profile_id;
              if (!profileId) {
                result = { error: "no profile to claim" };
                break;
              }
              const { data: created, error: authError } = await supabase.auth.admin.createUser({
                email: input.altEmail,
                email_confirm: true,
              });
              if (authError || !created?.user) {
                result = { error: `could not create account: ${authError?.message ?? "unknown error"}` };
                break;
              }
              await supabase
                .from("profiles")
                .update({
                  owner_user_id: created.user.id,
                  status: "claimed",
                  claim_date: new Date().toISOString(),
                  is_restricted: true,
                  verification_method: "alt_email_manual",
                })
                .eq("id", profileId);

              await supabase.from("profile_field_locks").insert(
                RESTRICTED_LOCK_FIELDS.map((field_name) => ({ profile_id: profileId, field_name })),
              );

              sessionUpdates.status = "claimed";
              sessionUpdates.visitor_user_id = created.user.id;

              await supabase.from("live_agent_requests").insert({
                type: "claim",
                session_id: sessionId,
                profile_id: profileId,
                reason: "access",
                summary: `Restricted claim via alternate email ${input.altEmail} — needs manual ownership verification.`,
                ai_snapshot_message_count: (history ?? []).length,
              });

              result = { claimed: true, restricted: true };
              break;
            }
            case "hand_off": {
              handOffPending = { reason: input.reason as string, summary: input.summary as string };
              result = { escalating: true };
              break;
            }
            default:
              result = { error: `unknown tool ${tool.name}` };
          }
        } catch (toolErr) {
          console.error(`tool ${tool.name} failed`, toolErr);
          result = { error: (toolErr as Error).message };
        }

        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "user", content: toolResults });

      if (handOffPending) break; // stop the loop; the escalation itself is finalized below
    }

    if (Object.keys(sessionUpdates).length > 0 || Object.keys(fields).length > 0) {
      await supabase
        .from("chat_sessions")
        .update({ ...sessionUpdates, fields })
        .eq("id", sessionId);
    }

    if (handOffPending) {
      const { data: request } = await supabase
        .from("live_agent_requests")
        .insert({
          type: "claim",
          session_id: sessionId,
          profile_id: session.profile_id,
          reason: handOffPending.reason,
          summary: handOffPending.summary,
          ai_snapshot_message_count: (history ?? []).length + 1,
        })
        .select("id")
        .single();

      await supabase
        .from("chat_sessions")
        .update({ status: "live_waiting", live_request_id: request?.id })
        .eq("id", sessionId);

      await supabase.from("agent_events").insert({
        session_id: sessionId,
        surface: session.mode === "claim" ? "Claim agent" : "Create agent",
        outcome: "handed_off",
        detail: handOffPending.reason,
      });

      finalText =
        finalText || "I'm connecting you with a member of our team who can help with this directly — they'll be with you shortly.";
    }

    if (!finalText) {
      finalText = "Sorry, I'm having trouble responding right now — would you like me to connect you with a person instead?";
    }

    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      sender: "agent",
      body: finalText,
      is_open_question: openQuestionFlagged,
    });

    return jsonResponse({
      reply: finalText,
      openQuestion: openQuestionFlagged,
      handedOff: Boolean(handOffPending),
      sessionStatus: sessionUpdates.status ?? session.status,
    });
  } catch (err) {
    console.error("ai-agent-turn error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
