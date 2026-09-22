import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerEnv } from "@/lib/supabase/env";

// Demo-only utility: mints a real, usable claim_tokens row and returns the
// exact link /api/claim/start already knows how to validate (claimSource:
// "claim_email_link") — the same link email-sequence-tick would otherwise
// only ever produce by actually sending mail through Resend. Demo profiles
// use @example.com addresses that were never going to receive a real inbox
// click, so this exists to demo/test that flow without burning a real send.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (appUser?.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, status").eq("id", id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (profile.status !== "unclaimed") {
    return NextResponse.json({ error: "this profile has already been claimed" }, { status: 409 });
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const rawToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { error } = await admin.from("claim_tokens").insert({
    token_hash: tokenHash,
    profile_id: profile.id,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: `${requireServerEnv("APP_URL")}/claim/${profile.id}?token=${rawToken}` });
}
