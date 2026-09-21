import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The enforce_upgrade_resolution_gate trigger (0011) is the actual
// enforcement of "payment before Pro can be marked resolved" — this route is
// a thin wrapper, so even a bug here can't bypass the database-level guard.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: request } = await supabase.from("live_agent_requests").select("*").eq("id", id).single();
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabase
    .from("live_agent_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (request.type === "claim" && request.session_id) {
    await supabase.from("chat_sessions").update({ status: "ready_to_claim" }).eq("id", request.session_id);
    await supabase.from("chat_messages").insert({
      session_id: request.session_id,
      sender: "system",
      body: "Your claim has been verified — please confirm below to finish.",
    });
  } else if (request.session_id) {
    await supabase.from("chat_messages").insert({
      session_id: request.session_id,
      sender: "liveagent",
      body: "This has been resolved — thanks for reaching out!",
      agent_name: "Support",
    });
  }

  await supabase.from("agent_events").insert({
    session_id: request.session_id,
    surface: request.type === "upgrade" ? "Upgrade assistant" : "Claim agent",
    outcome: "resolved_by_human",
  });

  return NextResponse.json({ ok: true });
}
