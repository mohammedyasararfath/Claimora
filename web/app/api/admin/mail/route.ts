import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Backs the /admin/mail "simulated inbox" — unlike the artifact's version
// (a fixed cast of fictional personas with hardcoded emails), this reads the
// real campaign_enrollments/email_events rows for whichever profiles are
// actually unclaimed right now, so what it shows always matches the real
// claim-email state in the database.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (appUser?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("status", "unclaimed")
    .not("email", "is", null)
    .order("name");

  if (!profiles || profiles.length === 0) return NextResponse.json({ inboxes: [] });

  const profileIds = profiles.map((p) => p.id);
  const [{ data: events }, { data: suppressions }] = await Promise.all([
    supabase
      .from("email_events")
      .select("profile_id, sequence_num, status, sent_at")
      .in("profile_id", profileIds)
      .order("sequence_num", { ascending: true }),
    supabase
      .from("email_suppressions")
      .select("email, reason")
      .in(
        "email",
        profiles.map((p) => p.email as string),
      ),
  ]);

  const suppressionByEmail = Object.fromEntries((suppressions ?? []).map((s) => [s.email, s.reason]));

  const inboxes = profiles.map((p) => ({
    profileId: p.id,
    name: p.name,
    email: p.email,
    suppressed: suppressionByEmail[p.email as string] ?? null,
    emails: (events ?? []).filter((e) => e.profile_id === p.id),
  }));

  return NextResponse.json({ inboxes });
}
