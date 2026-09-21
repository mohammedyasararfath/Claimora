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

  const [{ data: messages }, { data: session }, { data: profile }] = await Promise.all([
    request.session_id
      ? supabase.from("chat_messages").select("*").eq("session_id", request.session_id).order("created_at")
      : Promise.resolve({ data: [] }),
    request.session_id
      ? supabase.from("chat_sessions").select("fields, mode").eq("id", request.session_id).single()
      : Promise.resolve({ data: null }),
    request.profile_id
      ? supabase.from("profiles").select("name, category, city, brokerage, license, phone_e164, email").eq("id", request.profile_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Editable-fields panel starting values: whatever the AI/visitor has
  // already recorded in chat_sessions.fields takes precedence (it's the
  // live, in-progress state), falling back to the profile's on-file data —
  // matches what the visitor's own "What we have so far" panel shows.
  const fields = (session?.fields as Record<string, string>) ?? {};
  const editableFields = {
    full_name: fields.full_name ?? profile?.name ?? "",
    category: fields.category ?? profile?.category ?? "",
    city: fields.city ?? profile?.city ?? "",
    brokerage: fields.brokerage ?? profile?.brokerage ?? "",
    license: fields.license ?? profile?.license ?? "",
    contact_phone: fields.contact_phone ?? profile?.phone_e164 ?? "",
    contact_email: fields.contact_email ?? profile?.email ?? "",
  };

  return NextResponse.json({
    request,
    requirements: requirements ?? [],
    notes: notes ?? [],
    messages: messages ?? [],
    editableFields,
  });
}
