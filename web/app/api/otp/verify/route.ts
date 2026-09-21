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

    // Drop a system message into the transcript so the visitor doesn't land
    // on a blank chat right after verifying — matches the approved flow's
    // "✅ Identity verified..." confirmation shown before the AI conversation
    // starts.
    await admin.from("chat_messages").insert({
      session_id: otpRow.session_id,
      sender: "system",
      body: `✅ Identity verified via ${data.channel === "sms" ? "text message" : "email"} (${data.destination}) before starting the AI conversation.`,
    });
  }

  return NextResponse.json(data);
}
