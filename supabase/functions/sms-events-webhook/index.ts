// POST /functions/v1/sms-events-webhook
// Twilio status callback webhook. Verifies the X-Twilio-Signature header
// against the request URL + form body, then updates the matching sms_events
// row by provider_message_sid.

import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

async function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string) {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

Deno.serve(async (req) => {
  try {
    const authToken = requireEnv("TWILIO_AUTH_TOKEN");
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const bodyText = await req.text();
    const params = Object.fromEntries(new URLSearchParams(bodyText));
    const url = requireEnv("APP_URL") + "/functions/v1/sms-events-webhook";

    const valid = await verifyTwilioSignature(url, params, signature, authToken);
    if (!valid) {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const supabase = supabaseAdmin();
    await supabase
      .from("sms_events")
      .update({ status: (params.MessageStatus ?? "unknown").toLowerCase() })
      .eq("provider_message_sid", params.MessageSid);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("sms-events-webhook error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
