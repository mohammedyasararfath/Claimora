import { NextResponse } from "next/server";
import { altEmailSchema } from "@/lib/validation/schemas";
import { getAuthorizedSession } from "@/lib/chat/session-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = altEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const { session, client, error } = await getAuthorizedSession(parsed.data.sessionId);
  if (error || !session || !client) {
    return NextResponse.json({ error: error ?? "not authorized" }, { status: 403 });
  }

  await client
    .from("chat_sessions")
    .update({
      pre_verified: "restricted",
      fields: { ...(session.fields ?? {}), login_email: parsed.data.altEmail },
    })
    .eq("id", parsed.data.sessionId);

  await client.from("chat_messages").insert({
    session_id: parsed.data.sessionId,
    sender: "system",
    body: `Submitted an alternate email (${parsed.data.altEmail}) for manual verification.`,
  });

  return NextResponse.json({ ok: true });
}
