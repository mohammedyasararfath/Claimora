import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({ email: searchParams.get("email") });
  if (!parsed.success) return NextResponse.json({ error: "invalid email" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("email_suppressions").upsert({ email: parsed.data.email, reason: "unsubscribed" });

  // Also stop this profile's own campaign sequence immediately, matching the
  // approved unsubscribe behavior (a real suppression, not just a UI flag).
  const { data: profile } = await admin.from("profiles").select("id").eq("email", parsed.data.email).maybeSingle();
  if (profile) {
    await admin
      .from("campaign_enrollments")
      .update({ stopped_reason: "unsubscribed", next_scheduled_at: null })
      .eq("profile_id", profile.id);
  }

  return new NextResponse(
    "<html><body style='font-family:sans-serif;padding:40px;text-align:center'>You're unsubscribed from claim reminder emails.</body></html>",
    { headers: { "Content-Type": "text/html" } },
  );
}
