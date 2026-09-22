import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { contactRequestSchema, liveQueueCreateSchema } from "@/lib/validation/schemas";
import { getAuthorizedSession } from "@/lib/chat/session-auth";
import type { ChatMode } from "@/lib/types/database.types";

// Plain literal returns (not a Record<string, string[]> lookup) so
// TypeScript's noUncheckedIndexedAccess can't widen these to `string[] |
// undefined` — an index-signature lookup loses that guarantee even for
// known literal keys.
function requirementsFor(type: string, reason?: string | null, abandoned?: boolean): string[] {
  if (abandoned) return ["Reach out by phone/email", "Confirm status with visitor"];
  if (type === "contact") return ["Reply to requester", "Confirm resolved with requester"];
  if (type === "upgrade") {
    return [
      "Understand what the visitor actually needs",
      "Confirm the right package/add-on fit",
      "Answer pricing or billing questions",
      "Send payment request & collect successful payment",
      "Confirm PRO is active before resolving",
    ];
  }
  if (reason?.includes("dispute")) {
    return ["Verify caller identity", "Check prior claim history", "Confirm rightful owner", "Update profile ownership"];
  }
  if (reason?.includes("access")) {
    return ["Verify alternate email ownership", "Manually confirm identity", "Unlock profile fields"];
  }
  return ["Review conversation", "Verify identity", "Confirm claim details"];
}

// GET /api/live-queue — staff-only queue listing (RLS restricts rows to
// staff/admin automatically; this just adds ordering + related counts).
export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("live_agent_requests")
    .select("*")
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = liveQueueCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const { type, sessionId, profileId, reason, summary } = parsed.data;

  if (type === "contact") {
    const contactParsed = contactRequestSchema.safeParse(body);
    if (!contactParsed.success) {
      return NextResponse.json({ error: contactParsed.error.issues[0]?.message ?? "invalid contact request" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: request, error } = await admin
      .from("live_agent_requests")
      .insert({
        type: "contact",
        profile_id: contactParsed.data.profileId,
        requester_name: contactParsed.data.requesterName,
        requester_email: contactParsed.data.requesterEmail,
        requester_message: contactParsed.data.requesterMessage,
      })
      .select("id")
      .single();

    if (error || !request) return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });

    await admin.from("live_agent_requirements").insert(
      requirementsFor("contact").map((label, i) => ({ request_id: request.id, label, sort_order: i })),
    );

    return NextResponse.json({ requestId: request.id });
  }

  const admin = createAdminClient();

  // Two authorization paths: an in-conversation escalation must be tied to a
  // chat session the caller is authorized for (claim/create flow); a
  // dashboard-originated request (typically 'upgrade') has no chat session
  // at all — it's authorized by the caller actually owning the profile.
  let resolvedProfileId = profileId ?? null;
  let messageCount = 0;
  // This route's own hand-off paths only ever tie a session to a claim/create
  // conversation — a "dashboard" session escalates via the dashboard-copilot
  // edge function directly, never through here — but the type still has to
  // account for the full ChatMode union since session.mode carries it.
  let surfaceMode: ChatMode | null = null;

  if (sessionId) {
    const { session, error: authError } = await getAuthorizedSession(sessionId);
    if (authError || !session) {
      return NextResponse.json({ error: authError ?? "not authorized" }, { status: 403 });
    }
    resolvedProfileId = profileId ?? session.profile_id;
    surfaceMode = session.mode;
    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    messageCount = count ?? 0;
  } else {
    if (!profileId) {
      return NextResponse.json({ error: "sessionId or profileId is required" }, { status: 400 });
    }
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

    const { data: owned } = await admin
      .from("profiles")
      .select("id, owner_user_id, status, srs")
      .eq("id", profileId)
      .single();
    if (!owned || owned.owner_user_id !== user.id) {
      return NextResponse.json({ error: "not authorized for this profile" }, { status: 403 });
    }
  }

  const { data: request, error } = await admin
    .from("live_agent_requests")
    .insert({
      type,
      session_id: sessionId ?? null,
      profile_id: resolvedProfileId,
      reason: reason ?? "direct request",
      summary: summary ?? "Visitor asked to talk to a person.",
      ai_snapshot_message_count: messageCount,
      conversion_status: type === "upgrade" ? "discussing" : null,
    })
    .select("id")
    .single();

  if (error || !request) return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });

  await admin.from("live_agent_requirements").insert(
    requirementsFor(type, reason).map((label, i) => ({ request_id: request.id, label, sort_order: i })),
  );

  if (sessionId) {
    await admin.from("chat_sessions").update({ status: "live_waiting", live_request_id: request.id }).eq("id", sessionId);
  }

  await admin.from("agent_events").insert({
    session_id: sessionId ?? null,
    surface: type === "upgrade" ? "Upgrade assistant" : surfaceMode === "create" ? "Create agent" : "Claim agent",
    outcome: "handed_off",
    detail: reason ?? "direct request",
  });

  return NextResponse.json({ requestId: request.id });
}
