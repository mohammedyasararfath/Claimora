// POST /functions/v1/email-events-webhook
// Receives Resend's delivery/open/click/bounce/complaint webhooks. Verifies
// the Svix signature Resend signs webhooks with, then updates the matching
// email_events row. The monotonic-status guarantee (a click can't be
// downgraded by a later open event) is enforced in Postgres itself via the
// enforce_email_status_monotonic trigger (0011), not here.

import { Webhook } from "npm:svix@1";
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

const RESEND_TO_INTERNAL_STATUS: Record<string, string> = {
  "email.delivered": "received",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "spam",
};

Deno.serve(async (req) => {
  try {
    const secret = requireEnv("RESEND_WEBHOOK_SECRET");
    const payload = await req.text();
    const headers = {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    };

    let event: { type: string; data: { email_id: string } };
    try {
      event = new Webhook(secret).verify(payload, headers) as typeof event;
    } catch {
      return jsonResponse({ error: "invalid signature" }, 401);
    }

    const internalStatus = RESEND_TO_INTERNAL_STATUS[event.type];
    if (!internalStatus) {
      return jsonResponse({ ignored: event.type });
    }

    const supabase = supabaseAdmin();
    const timestampField: Record<string, string> = {
      received: "sent_at",
      opened: "opened_at",
      clicked: "clicked_at",
      bounced: "bounced_at",
      spam: "spam_at",
    };

    const field = timestampField[internalStatus];
    await supabase
      .from("email_events")
      .update({ status: internalStatus, ...(field ? { [field]: new Date().toISOString() } : {}) })
      .eq("provider_message_id", event.data.email_id);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("email-events-webhook error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
