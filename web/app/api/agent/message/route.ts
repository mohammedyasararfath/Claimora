import { NextResponse } from "next/server";
import { agentMessageSchema } from "@/lib/validation/schemas";
import { callEdgeFunction } from "@/lib/supabase/functions";
import { getAuthorizedSession } from "@/lib/chat/session-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = agentMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const { session, client, error } = await getAuthorizedSession(parsed.data.sessionId);
  if (error || !session || !client) {
    return NextResponse.json({ error: error ?? "not authorized" }, { status: 403 });
  }

  // While a live handoff is in progress (or waiting to start), messages go
  // straight into the shared transcript for the human agent to see — the AI
  // never re-enters the conversation. This mirrors the prototype, where
  // sendMessage() during live_waiting/live_active just appends to the
  // transcript instead of calling the model.
  if (session.status === "live_waiting" || session.status === "live_active") {
    const { error: insertError } = await client.from("chat_messages").insert({
      session_id: parsed.data.sessionId,
      sender: "visitor",
      body: parsed.data.message,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ reply: null, choices: null, handedOff: true, sessionStatus: session.status });
  }

  if (!["active", "ready_to_claim"].includes(session.status)) {
    return NextResponse.json(
      { error: `this conversation is ${session.status} and can't accept new messages` },
      { status: 409 },
    );
  }

  const { ok, status, data } = await callEdgeFunction("ai-agent-turn", parsed.data);
  return NextResponse.json(data, { status: ok ? 200 : status });
}
