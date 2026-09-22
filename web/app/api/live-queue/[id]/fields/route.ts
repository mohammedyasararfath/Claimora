import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  fields: z.record(z.string(), z.string()),
});

// Lets a live agent correct/fill in profile details mid-handoff. Edits merge
// directly into chat_sessions.fields — the same object the visitor's
// "What we have so far" panel polls — so a correction is visible to the
// visitor immediately, and every change is separately audited in
// live_agent_field_edits (staff-only, RLS-gated) for accountability.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: request } = await supabase
    .from("live_agent_requests")
    .select("session_id")
    .eq("id", id)
    .single();

  if (!request?.session_id) {
    return NextResponse.json({ error: "this request has no linked chat session" }, { status: 409 });
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("fields, pre_verified")
    .eq("id", request.session_id)
    .single();

  const oldFields = (session?.fields as Record<string, string>) ?? {};
  const nextFields = { ...oldFields };
  const audits: { request_id: string; field_name: string; old_value: string | null; new_value: string; edited_by: string }[] = [];

  for (const [key, value] of Object.entries(parsed.data.fields)) {
    if (oldFields[key] === value) continue;
    audits.push({ request_id: id, field_name: key, old_value: oldFields[key] ?? null, new_value: value, edited_by: user.id });
    nextFields[key] = value;
  }

  if (audits.length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  // confirm_claim (0013_confirm_claim_identity_guard.sql) requires the
  // account actually confirming the claim to match pre_verified.contact —
  // that's the address/number OTP-verified at the START of the session, and
  // it never otherwise changes. If a live agent corrects contact_email (e.g.
  // to work around an "account already exists" collision on the original
  // address) without this, the visitor is verified for one address but ends
  // up creating their account under another, and confirm_claim legitimately
  // (if confusingly) refuses to let them finish. A live agent editing the
  // field IS the re-verification here, same trust level as the OTP path, so
  // it re-stamps pre_verified.contact to match.
  const preVerified = session?.pre_verified as { channel?: string; contact?: string } | "restricted" | null;
  let nextPreVerified = session?.pre_verified;
  if (preVerified && typeof preVerified === "object" && preVerified.channel) {
    const channelField = preVerified.channel === "email" ? "contact_email" : preVerified.channel === "sms" ? "contact_phone" : null;
    if (channelField && parsed.data.fields[channelField]) {
      nextPreVerified = { ...preVerified, contact: parsed.data.fields[channelField].toLowerCase() };
    }
  }

  const { error: updateError } = await supabase
    .from("chat_sessions")
    .update({ fields: nextFields, pre_verified: nextPreVerified })
    .eq("id", request.session_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("live_agent_field_edits").insert(audits);

  return NextResponse.json({ ok: true, changed: audits.length });
}
