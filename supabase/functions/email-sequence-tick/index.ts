// POST /functions/v1/email-sequence-tick
// Invoked on a schedule (see supabase/CRON_SETUP.md or Vercel Cron). Sends the
// next due claim-email in each active campaign_enrollments row via Resend,
// records an email_events row, embeds a signed single-use claim token in the
// CTA link, and advances the enrollment's next_scheduled_at by
// campaigns.interval_days — or stops the sequence after sequence_length
// emails. Mirrors the prototype's claimSubjectFor()/nextScheduledFor() logic,
// now driven by a real scheduler instead of a render-time computation.

import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

const SUBJECTS = [
  "Your profile is ready to claim",
  "Reminder: your profile is still waiting to be claimed",
  "Final reminder: claim your profile",
];

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const supabase = supabaseAdmin();
    const appUrl = requireEnv("APP_URL");
    const resendKey = requireEnv("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM") ?? "Claimora <no-reply@claimora.app>";

    const { data: due, error } = await supabase
      .from("campaign_enrollments")
      .select("*, campaigns(*), profiles(*)")
      .lte("next_scheduled_at", new Date().toISOString())
      .is("stopped_reason", null)
      .limit(200);

    if (error) throw error;

    let sent = 0;

    for (const enrollment of due ?? []) {
      const profile = enrollment.profiles as Record<string, unknown>;
      const campaign = enrollment.campaigns as Record<string, unknown>;
      if (!profile?.email || profile.status !== "unclaimed") continue;

      const { data: suppressed } = await supabase
        .from("email_suppressions")
        .select("email")
        .eq("email", profile.email)
        .maybeSingle();
      if (suppressed) {
        await supabase
          .from("campaign_enrollments")
          .update({ stopped_reason: "unsubscribed", next_scheduled_at: null })
          .eq("id", enrollment.id);
        continue;
      }

      const sequenceNum = enrollment.emails_sent + 1;
      const subject = SUBJECTS[Math.min(sequenceNum - 1, SUBJECTS.length - 1)];

      const rawToken = randomToken();
      const tokenHash = await sha256Hex(rawToken);
      await supabase.from("claim_tokens").insert({
        token_hash: tokenHash,
        profile_id: profile.id,
        campaign_enrollment_id: enrollment.id,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const claimUrl = `${appUrl}/claim/${profile.id}?token=${rawToken}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: profile.email,
          subject,
          html: `<p>Hi ${profile.name},</p><p>${subject}. <a href="${claimUrl}">Claim your profile</a>.</p><p style="font-size:12px;color:#666">Didn't request this? <a href="${appUrl}/api/email/unsubscribe?email=${encodeURIComponent(String(profile.email))}">Unsubscribe</a>.</p>`,
        }),
      });

      const providerJson = res.ok ? await res.json() : null;

      await supabase.from("email_events").insert({
        enrollment_id: enrollment.id,
        profile_id: profile.id,
        sequence_num: sequenceNum,
        provider_message_id: providerJson?.id ?? null,
        status: res.ok ? "received" : "queued",
        sent_at: res.ok ? new Date().toISOString() : null,
      });

      const sequenceLength = (campaign?.sequence_length as number) ?? 3;
      const intervalDays = (campaign?.interval_days as number) ?? 15;
      const isLast = sequenceNum >= sequenceLength;

      await supabase
        .from("campaign_enrollments")
        .update({
          emails_sent: sequenceNum,
          next_scheduled_at: isLast
            ? null
            : new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
          stopped_reason: isLast ? "sequence_complete" : null,
        })
        .eq("id", enrollment.id);

      if (res.ok) sent += 1;
    }

    return jsonResponse({ sent, checked: due?.length ?? 0 });
  } catch (err) {
    console.error("email-sequence-tick error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
