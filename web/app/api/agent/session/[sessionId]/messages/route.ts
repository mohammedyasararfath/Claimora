import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/chat/session-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Anonymous (pre-auth) chat sessions can't use Supabase Realtime directly:
// Realtime is RLS-gated, and RLS has no way to identify a specific anonymous
// browser (auth.uid() is null for every anonymous visitor). Rather than
// weaken RLS to make that work, this route lets the ChatPanel poll for new
// messages using the same cookie-based session authorization every other
// anonymous-session endpoint uses. Authenticated surfaces (dashboard,
// agent-console) use genuine Supabase Realtime instead — see hooks/useLiveQueue.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { session, client, error } = await getAuthorizedSession(sessionId);

  if (error || !session || !client) {
    return NextResponse.json({ error: error ?? "not authorized" }, { status: 403 });
  }

  const [{ data: messages }, { data: freshSession }, { data: graphReads }, { data: openQuestions }] = await Promise.all([
    client.from("chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
    // Re-read the session fresh (not the snapshot getAuthorizedSession loaded)
    // so field captures and bio proposals made by the latest AI turn show up
    // in the same poll that picks up its messages.
    client.from("chat_sessions").select("status, fields, bio_state, intent, mode, pre_verified, live_request_id").eq("id", sessionId).single(),
    client.from("chat_graph_reads").select("field_name, value_returned, created_at").eq("session_id", sessionId).order("created_at"),
    client.from("chat_open_questions").select("topic, created_at").eq("session_id", sessionId).order("created_at"),
  ]);

  // The "Connected with {agent}" pill needs the assigned staffer's name.
  // app_users RLS only lets a row read itself, so a claimed (authenticated)
  // visitor's own `client` can't see the agent's row — this uses the admin
  // client for just this narrow, non-sensitive lookup (a first name), since
  // sessionId ownership was already verified above via getAuthorizedSession.
  let agentName: string | null = null;
  if (freshSession?.live_request_id) {
    const admin = createAdminClient();
    const { data: liveRequest } = await admin
      .from("live_agent_requests")
      .select("agent_user_id")
      .eq("id", freshSession.live_request_id)
      .single();
    if (liveRequest?.agent_user_id) {
      const { data: agentUser } = await admin
        .from("app_users")
        .select("full_name")
        .eq("id", liveRequest.agent_user_id)
        .single();
      agentName = agentUser?.full_name ?? null;
    }
  }

  return NextResponse.json({
    status: freshSession?.status ?? session.status,
    fields: freshSession?.fields ?? session.fields,
    bioState: freshSession?.bio_state ?? session.bio_state,
    intent: freshSession?.intent ?? session.intent,
    mode: freshSession?.mode ?? session.mode,
    preVerified: freshSession?.pre_verified ?? session.pre_verified,
    graphReads: graphReads ?? [],
    openQuestions: openQuestions ?? [],
    messages: messages ?? [],
    agentName,
  });
}
