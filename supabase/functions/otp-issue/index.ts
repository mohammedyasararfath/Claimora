// POST /functions/v1/otp-issue
// Body: { profileId: string, channel: "email" | "sms", sessionId?: string }
// Generates a 6-digit OTP, stores only its hash, and sends it via Resend
// (email) or Twilio (sms). The raw code is NOT returned in the response or
// logged by default — this is the production replacement for the
// prototype's client-visible `Math.random()` code.
//
// DEV/DEMO ESCAPE HATCH: when the SHOW_OTP_IN_UI secret is exactly "true",
// the response also includes the raw `code`, and a real send failure (e.g.
// no email/SMS provider configured yet) no longer fails the request — you
// can log in without a working provider. This must be explicitly enabled
// (`supabase secrets set SHOW_OTP_IN_UI=true`) and should be turned back off
// before this is a real product real users rely on; it is never on by default.

import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

const OTP_TTL_MINUTES = 10;
const MAX_ISSUES_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const code = (bytes[0] % 1_000_000).toString().padStart(6, "0");
  return code;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{2})/g, "*");
}

async function sendEmailOtp(destination: string, code: string) {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM") ?? "Claimora <no-reply@claimora.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: destination,
      subject: `${code} is your verification code`,
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

async function sendSmsOtp(destination: string, code: string) {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_FROM_NUMBER");
  const body = new URLSearchParams({
    To: destination,
    From: from,
    Body: `Your Claimora verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { profileId, channel, sessionId } = await req.json();

    if (!profileId || !["email", "sms"].includes(channel)) {
      return jsonResponse({ error: "profileId and a valid channel are required" }, 400);
    }

    const supabase = supabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, phone_e164")
      .eq("id", profileId)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: "profile not found" }, 404);
    }

    const destination = channel === "email" ? profile.email : profile.phone_e164;
    if (!destination) {
      return jsonResponse({ error: `profile has no ${channel} on file` }, 422);
    }

    // Rate limit: at most MAX_ISSUES_PER_WINDOW issues per destination per WINDOW_MINUTES.
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from("otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("destination", destination)
      .gte("created_at", windowStart);

    if ((count ?? 0) >= MAX_ISSUES_PER_WINDOW) {
      return jsonResponse(
        { error: "too many codes requested for this destination, try again later" },
        429,
      );
    }

    const code = generateCode();
    const pepper = requireEnv("OTP_HASH_PEPPER");
    const codeHash = await sha256Hex(code + pepper);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const { data: otpRow, error: insertError } = await supabase
      .from("otp_codes")
      .insert({
        profile_id: profileId,
        session_id: sessionId ?? null,
        channel,
        destination,
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !otpRow) {
      throw new Error(insertError?.message ?? "failed to store OTP");
    }

    const showInUi = Deno.env.get("SHOW_OTP_IN_UI") === "true";
    let sendError: string | null = null;

    try {
      if (channel === "email") {
        await sendEmailOtp(destination, code);
      } else {
        await sendSmsOtp(destination, code);
      }
    } catch (err) {
      if (!showInUi) throw err; // normal behavior: a failed send fails the request
      sendError = (err as Error).message; // dev escape hatch: log it, still succeed
      console.error("otp-issue: real send failed, continuing because SHOW_OTP_IN_UI=true", err);
    }

    return jsonResponse({
      otpId: otpRow.id,
      channel,
      maskedDestination: channel === "email" ? maskEmail(destination) : maskPhone(destination),
      expiresAt,
      ...(showInUi ? { code, sendError } : {}),
    });
  } catch (err) {
    console.error("otp-issue error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
