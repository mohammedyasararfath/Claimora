import { NextResponse } from "next/server";
import { otpIssueSchema } from "@/lib/validation/schemas";
import { callEdgeFunction } from "@/lib/supabase/functions";
import { getAuthorizedSession } from "@/lib/chat/session-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = otpIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  if (parsed.data.sessionId) {
    const { error } = await getAuthorizedSession(parsed.data.sessionId);
    if (error) return NextResponse.json({ error }, { status: 403 });
  }

  const { ok, status, data } = await callEdgeFunction("otp-issue", parsed.data);
  return NextResponse.json(data, { status: ok ? 200 : status });
}
