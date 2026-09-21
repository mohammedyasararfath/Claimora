import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/chat/session-auth";

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

  const { data: messages } = await client
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  // Re-read the session fresh (not the snapshot getAuthorizedSession loaded)
  // so field captures and bio proposals made by the latest AI turn show up
  // in the same poll that picks up its messages.
  const { data: freshSession } = await client.from("chat_sessions").select("status, fields, bio_state").eq("id", sessionId).single();

  return NextResponse.json({
    status: freshSession?.status ?? session.status,
    fields: freshSession?.fields ?? session.fields,
    bioState: freshSession?.bio_state ?? session.bio_state,
    messages: messages ?? [],
  });
}
