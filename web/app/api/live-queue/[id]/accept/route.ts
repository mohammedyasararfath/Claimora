import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  // RLS ("staff manage queue") already restricts this update to live_agent/admin
  // roles — a non-staff caller's update simply matches zero rows.
  const { data, error } = await supabase
    .from("live_agent_requests")
    .update({ status: "active", agent_user_id: user.id, accepted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "waiting")
    .select("id, session_id")
    .single();

  if (error || !data) {
    // A failed .update().eq("status","waiting").select().single() means 0 rows
    // matched — almost always another staff member (or a duplicate click)
    // already accepted it a moment earlier. Postgrest's raw error for that case
    // ("Cannot coerce the result to a single JSON object") is a confusing thing
    // to show a person, so it's never surfaced — this is always a benign race,
    // not a real server error.
    return NextResponse.json({ error: "already accepted by someone else — refreshing the queue" }, { status: 409 });
  }

  if (data.session_id) {
    await supabase.from("chat_sessions").update({ status: "live_active" }).eq("id", data.session_id);
    await supabase.from("chat_messages").insert({
      session_id: data.session_id,
      sender: "system",
      body: "A team member has joined the conversation.",
    });
  }

  return NextResponse.json({ ok: true });
}
