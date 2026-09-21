// POST /functions/v1/otp-verify
// Body: { otpId: string, code: string }
// Verifies a code against its stored hash, enforcing expiry and a max-attempt
// lockout. On success, returns a verification receipt the caller writes onto
// chat_sessions.pre_verified — this function never mutates chat_sessions
// itself, keeping it a single-purpose primitive.

import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { otpId, code } = await req.json();
    if (!otpId || !code) {
      return jsonResponse({ error: "otpId and code are required" }, 400);
    }

    const supabase = supabaseAdmin();

    const { data: otp, error } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("id", otpId)
      .single();

    if (error || !otp) {
      return jsonResponse({ error: "verification code not found" }, 404);
    }

    if (otp.verified_at) {
      return jsonResponse({ error: "this code has already been used" }, 409);
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "this code has expired, request a new one" }, 410);
    }

    if (otp.attempts >= otp.max_attempts) {
      return jsonResponse({ error: "too many incorrect attempts, request a new code" }, 429);
    }

    const pepper = requireEnv("OTP_HASH_PEPPER");
    const candidateHash = await sha256Hex(String(code).trim() + pepper);
    const isMatch = candidateHash === otp.code_hash;

    await supabase
      .from("otp_codes")
      .update({
        attempts: otp.attempts + 1,
        verified_at: isMatch ? new Date().toISOString() : null,
      })
      .eq("id", otpId);

    if (!isMatch) {
      const remaining = otp.max_attempts - (otp.attempts + 1);
      return jsonResponse(
        { error: "incorrect code", attemptsRemaining: Math.max(remaining, 0) },
        401,
      );
    }

    return jsonResponse({
      verified: true,
      channel: otp.channel,
      destination: otp.destination,
      profileId: otp.profile_id,
    });
  } catch (err) {
    console.error("otp-verify error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
