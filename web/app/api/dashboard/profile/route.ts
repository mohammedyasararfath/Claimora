import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const EDITABLE_FIELDS = ["full_name", "category", "city", "brokerage", "license", "phone_e164", "email", "snippet"] as const;

const schema = z.object({
  fields: z.record(z.enum(EDITABLE_FIELDS), z.string()),
});

// The owner-update RLS policy (0010_rls_policies.sql) already lets an owner
// change their own profile's non-status/non-srs fields directly — but it has
// no idea about profile_field_locks (set by a restricted claim, pending
// manual identity verification). This route is what actually enforces that:
// without it, a restricted owner could edit their locked name/license fields
// straight through RLS despite the UI telling them those are locked.
export async function PATCH(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "no profile linked to this account" }, { status: 404 });

  const { data: locks } = await supabase.from("profile_field_locks").select("field_name").eq("profile_id", profile.id);
  const lockedFields = new Set((locks ?? []).map((l) => l.field_name));

  const update: ProfileUpdate = {};
  for (const [key, value] of Object.entries(parsed.data.fields) as [keyof typeof parsed.data.fields, string][]) {
    if (lockedFields.has(key)) {
      return NextResponse.json({ error: `"${key.replace(/_/g, " ")}" is locked pending manual verification` }, { status: 409 });
    }
    // profile_field_locks rows use "full_name" for the column that's
    // actually named "name" on the profiles table — translate here.
    if (key === "full_name") update.name = value;
    else update[key] = value;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, changed: Object.keys(update).length });
}
