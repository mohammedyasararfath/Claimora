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

  const { session, error } = await getAuthorizedSession(parsed.data.sessionId);
  if (error || !session) {
    return NextResponse.json({ error: error ?? "not authorized" }, { status: 403 });
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
