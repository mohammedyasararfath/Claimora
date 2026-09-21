import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveQueueMessageSchema } from "@/lib/validation/schemas";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = liveQueueMessageSchema.safeParse({ ...body, requestId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("full_name").eq("id", user.id).single();
  const { data: request } = await supabase.from("live_agent_requests").select("session_id").eq("id", id).single();

  if (!request?.session_id) {
    return NextResponse.json({ error: "this request has no linked chat session" }, { status: 409 });
  }

  const { error } = await supabase.from("chat_messages").insert({
    session_id: request.session_id,
    sender: "liveagent",
    agent_name: appUser?.full_name ?? "Support",
    body: parsed.data.body,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
