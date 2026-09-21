import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: request }, { data: requirements }, { data: notes }] = await Promise.all([
    supabase.from("live_agent_requests").select("*").eq("id", id).single(),
    supabase.from("live_agent_requirements").select("*").eq("request_id", id).order("sort_order"),
    supabase.from("live_agent_notes").select("*").eq("request_id", id).order("created_at", { ascending: false }),
  ]);

  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: messages } = request.session_id
    ? await supabase.from("chat_messages").select("*").eq("session_id", request.session_id).order("created_at")
    : { data: [] };

  return NextResponse.json({ request, requirements: requirements ?? [], notes: notes ?? [], messages: messages ?? [] });
}
