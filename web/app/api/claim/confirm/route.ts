import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimConfirmSchema } from "@/lib/validation/schemas";

// Calls the confirm_claim() Postgres function (0011_functions_and_triggers.sql)
// as the signed-in visitor — it's a security-definer function that only lets
// them confirm a session that is actually theirs and actually ready, so this
// route is a thin, RLS-respecting wrapper rather than a privileged operation
// in application code.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = claimConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { error } = await supabase.rpc("confirm_claim", { p_session_id: parsed.data.sessionId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
