// POST /functions/v1/dashboard-copilot
// Body: { mode: "chat" | "insight", profile: {...}, ownerUserId, sessionId?, history?, message? }
//
// A lightweight copilot for the claimed-profile dashboard — distinct from
// ai-agent-turn (which drives the claim/create conversation). Unlike the
// first version of this function, chat-mode turns are now persisted through
// the same chat_sessions/chat_messages/live_agent_requests machinery the
// claim flow's live-agent handoff already uses successfully — otherwise a
// staff member accepting an escalation from here sees "no linked
// conversation" with zero context on what was actually discussed, and the
// visitor's dashboard has no way to keep chatting with the human afterward.
// insight mode stays fully stateless (it's a one-off suggestion line, not a
// conversation).

import Anthropic from "npm:@anthropic-ai/sdk@0.32";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { requireEnv, supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";

// Mirrors requirementsFor("upgrade", ...) in app/api/live-queue/route.ts —
// duplicated rather than shared because that file isn't reachable from a
// Deno edge function; keep the two in sync if this list ever changes.
const UPGRADE_REQUIREMENTS = [
  "Understand what the visitor actually needs",
  "Confirm the right package/add-on fit",
  "Answer pricing or billing questions",
  "Send payment request & collect successful payment",
  "Confirm PRO is active before resolving",
];

type Profile = {
  id: string;
  name: string;
  category: string;
  city: string | null;
  status: string;
  srs: number;
  reviews_count: number;
  rating: number;
  brokerage: string | null;
  license: string | null;
  phone_e164: string | null;
  email: string | null;
  snippet: string | null;
};

function profileSnapshot(profile: Profile): string {
  return `- Tier: ${profile.status}
- Search Rank Score: ${profile.srs} of 850
- Reviews on file: ${profile.reviews_count}
- Rating: ${profile.rating}
- Profile fields on file: ${[
    profile.brokerage && "brokerage",
    profile.license && "license",
    profile.phone_e164 && "phone",
    profile.email && "email",
    profile.snippet && "bio",
  ]
    .filter(Boolean)
    .join(", ") || "none beyond the required basics"}
- Missing fields worth completing: ${[
    !profile.brokerage && "brokerage",
    !profile.license && "license",
    !profile.snippet && "a profile bio",
  ]
    .filter(Boolean)
    .join(", ") || "none — the profile is fully filled in"}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "offer_choices",
    description:
      "Replace the quick-questions dropdown with 2-4 contextual follow-up options for what you just discussed.",
    input_schema: {
      type: "object",
      properties: { choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
      required: ["choices"],
    },
  },
  {
    name: "show_payment_form",
    description:
      "Show the visitor an inline payment form for the Pro plan, right in this chat, once they've said what they're hoping to achieve and are ready to pay. Never share a payment link or ask them to go to another page — this form completes the upgrade in place. Do NOT use escalate_to_sales_agent just to collect payment.",
    input_schema: {
      type: "object",
      properties: {
        cycle: { type: "string", enum: ["monthly", "yearly"] },
        addon: { type: "boolean", description: "Whether to include the Win Local Search add-on." },
      },
      required: ["cycle"],
    },
  },
  {
    name: "escalate_to_sales_agent",
    description:
      "Hand off to a human team member — use only for a billing question you can't answer, an ownership/account problem, or an explicit request for a person. NOT for collecting payment: once the visitor is ready to pay, call show_payment_form instead — never escalate just to hand them a payment link.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" }, summary: { type: "string" } },
      required: ["reason", "summary"],
    },
  },
];

// Duplicated from web/lib/payments/paymentFormMarker.ts — this Deno function
// can't import that file, but both sides must agree on the exact prefix.
const PAYMENT_FORM_MARKER = "__PAYMENT_FORM__";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { mode, profile, ownerUserId, sessionId, history, message } = await req.json();
    if (!profile) return jsonResponse({ error: "profile is required" }, 400);

    const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const baseSystem = `You are Claimora's dashboard copilot, helping ${profile.name} (a ${profile.category}${profile.city ? ` in ${profile.city}` : ""}) understand and improve their profile and Search Rank Score (SRS). Never invent numbers, review counts, or claims beyond the snapshot below. Write plain conversational text only — no markdown, no **bold**, no bullet lists, no headings.

Profile snapshot:
${profileSnapshot(profile)}

SRS is scored 0-850 based on review velocity/reply rate, profile completeness, and (for Pro) web analytics and listings signals.`;

    if (mode === "insight") {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 100,
        system: `${baseSystem}\n\nWrite ONE short, specific, encouraging sentence (max ~20 words) recommending the single next action that would most help this profile — grounded only in the snapshot above. Do not invent review counts, client names, or activity you can't see. No greeting, no sign-off, just the one sentence.`,
        messages: [{ role: "user", content: "What's the single best next step for this profile right now?" }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      return jsonResponse({
        insight: text || "Earn Search Rank Score points by receiving and replying to reviews.",
      });
    }

    if (!message) return jsonResponse({ error: "message is required for chat mode" }, 400);
    if (!ownerUserId) return jsonResponse({ error: "ownerUserId is required for chat mode" }, 400);

    const admin = supabaseAdmin();

    // Lazily create the persisted session on the first turn. visitor_user_id
    // is the owner's own real account (they're authenticated, not anon) —
    // this reuses the exact same RLS ("visitor_user_id = auth.uid()") the
    // claim flow's chat_messages policy already grants, so no new policy is
    // needed for the owner to read/send in their own dashboard session.
    let activeSessionId = sessionId as string | null;
    if (!activeSessionId) {
      const { data: created } = await admin
        .from("chat_sessions")
        .insert({ mode: "dashboard", status: "active", profile_id: profile.id, visitor_user_id: ownerUserId })
        .select("id")
        .single();
      activeSessionId = created?.id ?? null;
    }

    if (activeSessionId) {
      await admin.from("chat_messages").insert({ session_id: activeSessionId, sender: "visitor", body: message });
    }

    const messages: Anthropic.MessageParam[] = [
      ...((history ?? []) as { role: "user" | "assistant"; content: string }[]),
      { role: "user", content: message },
    ];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `${baseSystem}\n\nWhenever you offer a small discrete set of follow-up options, call offer_choices with those exact options in the same turn. If the visitor expresses interest in upgrading to Pro (e.g. "upgrade me to PRO"), don't jump to payment right away — first ask what they're hoping to achieve and call offer_choices with a few likely motivations (e.g. more leads and visibility, ranking higher against competitors, building credibility with a PRO badge, something else), then answer their feature questions yourself using the profile snapshot above (don't state a specific price — the payment form itself shows the exact amount). Once they've confirmed they want to upgrade and which cycle (default to yearly if they don't say), call show_payment_form — that shows a real payment form right in this chat; never describe a link or tell them to go to a page. Only call escalate_to_sales_agent for an actual billing question you can't answer or an explicit request for a person — never just to collect payment.`,
      tools: TOOLS,
      messages,
    });

    let reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    let choices: string[] | null = null;
    let handedOff = false;
    let paymentForm: { cycle: "monthly" | "yearly"; addon: boolean } | null = null;

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      if (block.name === "offer_choices") {
        choices = (input.choices as string[]).slice(0, 4);
      } else if (block.name === "show_payment_form") {
        paymentForm = { cycle: input.cycle === "monthly" ? "monthly" : "yearly", addon: Boolean(input.addon) };
        reply = reply || "Here's your payment form — you can complete the upgrade right here.";
        // Persisted too (not just returned in the response) so it's still
        // there for the owner's own chat_messages history / admin review —
        // the client renders the form from the JSON response below, since
        // an "active" (not yet escalated) session isn't polling the DB.
        if (activeSessionId) {
          await admin.from("chat_messages").insert({
            session_id: activeSessionId,
            sender: "system",
            body: `${PAYMENT_FORM_MARKER}${JSON.stringify(paymentForm)}`,
          });
        }
      } else if (block.name === "escalate_to_sales_agent") {
        reply = reply || "I've connected you with a team member — they'll follow up with you shortly.";

        if (activeSessionId) {
          const { count: messageCount } = await admin
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("session_id", activeSessionId);

          const { data: request } = await admin
            .from("live_agent_requests")
            .insert({
              type: "upgrade",
              session_id: activeSessionId,
              profile_id: profile.id,
              reason: (input.reason as string) ?? "dashboard copilot escalation",
              summary: (input.summary as string) ?? `${profile.name} asked the dashboard AI Copilot for help.`,
              current_tier: profile.status,
              current_srs: profile.srs,
              ai_snapshot_message_count: messageCount ?? 0,
            })
            .select("id")
            .single();

          if (request) {
            await admin.from("live_agent_requirements").insert(
              UPGRADE_REQUIREMENTS.map((label, i) => ({ request_id: request.id, label, sort_order: i })),
            );
            await admin
              .from("chat_sessions")
              .update({ status: "live_waiting", live_request_id: request.id })
              .eq("id", activeSessionId);
            await admin.from("chat_messages").insert({
              session_id: activeSessionId,
              sender: "system",
              body: "I'm connecting you with a member of our team who can help with this directly — they'll be with you shortly.",
            });
          }

          await admin.from("agent_events").insert({
            session_id: activeSessionId,
            surface: "Upgrade assistant",
            outcome: "handed_off",
            detail: (input.reason as string) ?? "dashboard_copilot",
          });
        }

        handedOff = true;
      }
    }

    if (activeSessionId && reply) {
      await admin.from("chat_messages").insert({ session_id: activeSessionId, sender: "agent", body: reply });
    }

    return jsonResponse({
      reply: reply || "I don't have a good answer for that yet — try asking about your SRS or what's missing from your profile.",
      choices,
      handedOff,
      paymentForm,
      sessionId: activeSessionId,
    });
  } catch (err) {
    console.error("dashboard-copilot error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
