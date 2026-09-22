import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/chat/session-auth";

// Accepting a proposed bio is a deterministic UI action (the visitor clicked
// a button), not something worth routing through the AI's tool-call loop to
// interpret from free text — no tool exists to flip bio_state.status to
// "accepted" (propose_bio always resets it to "proposed"), which otherwise
// makes complete_claim's "bio accepted" gate for new profiles unreachable.
export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { session, client, error } = await getAuthorizedSession(sessionId);
  if (error || !session || !client) {
    return NextResponse.json({ error: error ?? "not authorized" }, { status: 403 });
  }

  const bioState = session.bio_state as { text?: string; status?: string } | null;
  if (!bioState?.text) {
    return NextResponse.json({ error: "no proposed bio to accept" }, { status: 409 });
  }

  const { error: updateError } = await client
    .from("chat_sessions")
    .update({ bio_state: { ...bioState, status: "accepted" } })
    .eq("id", sessionId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
