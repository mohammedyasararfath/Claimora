import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Shared by the unsubscribe and report-spam links every claim-reminder email
// carries. Both need to (a) suppress the address for all future sends, (b)
// stop that profile's own campaign sequence, and (c) mark the specific email
// they clicked from as unsubscribed/spam — not just flip a global flag,
// since the admin's per-profile journey view (EmailJourneyRow) reads that
// status off email_events, not email_suppressions.
export async function suppressEmail(email: string, reason: "unsubscribed" | "spam") {
  const admin = createAdminClient();

  await admin.from("email_suppressions").upsert({ email, reason });

  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) return;

  await admin
    .from("campaign_enrollments")
    .update({ stopped_reason: reason, next_scheduled_at: null })
    .eq("profile_id", profile.id)
    .is("stopped_reason", null);

  const { data: latestEvent } = await admin
    .from("email_events")
    .select("id")
    .eq("profile_id", profile.id)
    .order("sequence_num", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestEvent) {
    const now = new Date().toISOString();
    await admin
      .from("email_events")
      .update(reason === "spam" ? { status: "spam", spam_at: now } : { status: "unsubscribed", unsubscribed_at: now })
      .eq("id", latestEvent.id);
  }
}
