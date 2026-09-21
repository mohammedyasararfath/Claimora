import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveQueueNoteSchema } from "@/lib/validation/schemas";

// live_agent_notes has no client-facing select policy for non-staff at all
// (0010), so this note is guaranteed never visible to the visitor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = liveQueueNoteSchema.safeParse({ ...body, requestId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { error } = await supabase
    .from("live_agent_notes")
    .insert({ request_id: id, agent_user_id: user.id, note: parsed.data.note });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
