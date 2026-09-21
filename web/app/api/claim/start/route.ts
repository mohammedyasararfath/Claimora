import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { claimStartSchema } from "@/lib/validation/schemas";
import { ANON_COOKIE, generateAnonToken } from "@/lib/chat/session-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = claimStartSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  let { profileId } = parsed.data;
  const { freeformText, claimSource, claimToken } = parsed.data;

  if (!profileId && !freeformText) {
    return NextResponse.json({ error: "profileId or freeformText is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let claimTokenHash: string | null = null;

  if (claimSource === "claim_email_link") {
    if (!claimToken) {
      return NextResponse.json({ error: "missing claim token" }, { status: 400 });
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(claimToken));
    const tokenHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: tokenRow } = await admin
      .from("claim_tokens")
      .select("token_hash, profile_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "this claim link is invalid or has expired" }, { status: 410 });
    }

    // The validated token is authoritative — never trust a client-supplied
    // profileId for this path, so a forged request can't be pointed at a
    // different profile than the one the email was actually sent for.
    profileId = tokenRow.profile_id;
    claimTokenHash = tokenRow.token_hash;
  }

  const mode = profileId ? "claim" : "create";

  let claimedProfileEmail: string | null = null;

  if (profileId) {
    const { data: profile } = await admin.from("profiles").select("id, status, email").eq("id", profileId).single();
    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }
    if (profile.status !== "unclaimed") {
      return NextResponse.json({ error: "this profile has already been claimed" }, { status: 409 });
    }
    claimedProfileEmail = profile.email;
  }

  const anonToken = user ? null : generateAnonToken();

  const { data: session, error } = await admin
    .from("chat_sessions")
    .insert({
      mode,
      profile_id: profileId ?? null,
      visitor_user_id: user?.id ?? null,
      anon_token: anonToken,
      claim_source: claimSource === "claim_email_link" ? "Claim email link" : "Search results",
      fields: freeformText ? { initial_intent: freeformText } : {},
      // The claim-email-link path treats the click itself as proof of email
      // ownership, matching the prototype's startClaimFlow() behavior.
      pre_verified:
        claimSource === "claim_email_link" && claimedProfileEmail
          ? { channel: "email", contact: claimedProfileEmail }
          : null,
    })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? "failed to start session" }, { status: 500 });
  }

  if (claimTokenHash) {
    await admin
      .from("claim_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", claimTokenHash);
  }

  await admin.from("agent_events").insert({
    session_id: session.id,
    surface: mode === "claim" ? "Claim agent" : "Create agent",
    outcome: "started",
  });

  const response = NextResponse.json({ sessionId: session.id, mode });

  if (anonToken) {
    response.cookies.set(ANON_COOKIE, anonToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 2, // 2 hours — long enough to finish a claim conversation
    });
  }

  return response;
}
