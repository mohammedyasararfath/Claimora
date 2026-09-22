import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Outcome = "started" | "converted" | "handed_off" | "resolved_by_human" | "abandoned";

// agent_events' own RLS ("staff read agent events") allows any staff
// (admin or live_agent) to select it, but this specific view is meant to be
// admin-only — and unlike /admin/* pages, an /api/admin/* route isn't
// covered by middleware's ADMIN_PREFIX check (that only matches page paths
// starting with "/admin", not "/api/admin/..."), so the admin-only
// restriction has to be enforced explicitly here rather than assumed.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (appUser?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { data: events, error } = await supabase
    .from("agent_events")
    .select("surface, outcome, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals: Record<Outcome, number> = { started: 0, converted: 0, handed_off: 0, resolved_by_human: 0, abandoned: 0 };
  const bySurface = new Map<string, Record<Outcome, number>>();

  for (const e of events ?? []) {
    const outcome = e.outcome as Outcome;
    totals[outcome] += 1;

    if (!bySurface.has(e.surface)) {
      bySurface.set(e.surface, { started: 0, converted: 0, handed_off: 0, resolved_by_human: 0, abandoned: 0 });
    }
    bySurface.get(e.surface)![outcome] += 1;
  }

  const surfaces = [...bySurface.entries()].map(([surface, counts]) => ({
    surface,
    ...counts,
    stillOpen: Math.max(0, counts.started - counts.converted - counts.resolved_by_human - counts.abandoned),
  }));

  return NextResponse.json({
    totals,
    surfaces,
    events: (events ?? []).slice(0, 50),
  });
}
