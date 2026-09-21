import { NextResponse } from "next/server";
import { otpVerifySchema } from "@/lib/validation/schemas";
import { callEdgeFunction } from "@/lib/supabase/functions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const { ok, status, data } = await callEdgeFunction<{
    verified?: boolean;
    channel?: string;
    destination?: string;
    profileId?: string;
    error?: string;
  }>("otp-verify", parsed.data);

  if (!ok || !data.verified) {
    return NextResponse.json(data, { status: ok ? 200 : status });
  }

  // On success, persist the verification onto whichever chat session this
  // OTP was issued for (otp_codes.session_id), so the AI agent / verify
  // screen both see pre_verified without the client having to round-trip it.
  const admin = createAdminClient();
  const { data: otpRow } = await admin.from("otp_codes").select("session_id").eq("id", parsed.data.otpId).maybeSingle();

  if (otpRow?.session_id) {
    await admin
      .from("chat_sessions")
      .update({ pre_verified: { channel: data.channel, contact: data.destination } })
      .eq("id", otpRow.session_id);
  }

  return NextResponse.json(data);
}
