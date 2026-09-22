import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminProfilesQuerySchema } from "@/lib/validation/schemas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = adminProfilesQuerySchema.safeParse({
    filter: searchParams.get("filter") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid query" }, { status: 400 });

  // RLS's "admin full access" policy on profiles enforces the actual
  // authorization here — a non-admin caller gets an empty result set, not a
  // 403, which is fine since the /admin route itself is already middleware-gated.
  const supabase = await createClient();
  const { filter, page, pageSize } = parsed.data;

  let query = supabase.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (filter !== "all") query = query.eq("status", filter);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ count: unclaimedCount }, { count: claimedCount }, { count: proCount }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "unclaimed"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pro"),
  ]);

  // So the table can show mail-sent-date/claim-email-status at a glance
  // (matching the artifact's columns) without every row needing to expand
  // into EmailJourneyRow first.
  const unclaimedIds = (data ?? []).filter((p) => p.status === "unclaimed").map((p) => p.id);
  const [{ data: events }, { data: enrollments }] = await Promise.all([
    unclaimedIds.length > 0
      ? supabase
          .from("email_events")
          .select("profile_id, status, sent_at")
          .in("profile_id", unclaimedIds)
          .order("sequence_num", { ascending: false })
      : Promise.resolve({ data: [] }),
    unclaimedIds.length > 0
      ? supabase.from("campaign_enrollments").select("profile_id, stopped_reason").in("profile_id", unclaimedIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Rows come back newest-sequence-first, so the first one seen per profile
  // is the latest email.
  const latestEmailByProfile: Record<string, { status: string; sent_at: string | null }> = {};
  for (const e of events ?? []) {
    if (!latestEmailByProfile[e.profile_id]) latestEmailByProfile[e.profile_id] = { status: e.status, sent_at: e.sent_at };
  }
  const campaignActiveByProfile = Object.fromEntries(
    (enrollments ?? []).map((e) => [e.profile_id, e.stopped_reason === null]),
  );

  return NextResponse.json({
    profiles: data,
    total: count ?? 0,
    summary: { unclaimed: unclaimedCount ?? 0, claimed: claimedCount ?? 0, pro: proCount ?? 0 },
    latestEmailByProfile,
    campaignActiveByProfile,
  });
}
