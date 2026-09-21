import { NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/supabase/env";

const JOB_TO_FUNCTION: Record<string, string> = {
  "email-sequence": "email-sequence-tick",
  "abandoned-sweep": "abandoned-session-sweep",
};

// Alternative to the pg_cron setup in supabase/CRON_SETUP.md — Vercel Cron
// hits this route on a schedule (see vercel.json's "crons"), which forwards
// to the matching Edge Function with the service-role key attached server-side.
// Use one scheduler or the other, never both, or sends will duplicate.
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const fn = JOB_TO_FUNCTION[job];
  if (!fn) return NextResponse.json({ error: "unknown cron job" }, { status: 404 });

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${requireServerEnv("CRON_SECRET")}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireServerEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      "x-cron-secret": requireServerEnv("CRON_SECRET"),
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
