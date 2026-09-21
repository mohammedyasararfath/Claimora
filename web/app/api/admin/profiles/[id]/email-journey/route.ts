import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("campaign_enrollments")
    .select("*, campaigns(name, interval_days, sequence_length)")
    .eq("profile_id", id)
    .maybeSingle();

  const { data: events } = await supabase
    .from("email_events")
    .select("*")
    .eq("profile_id", id)
    .order("sequence_num", { ascending: true });

  return NextResponse.json({ enrollment, events: events ?? [] });
}
