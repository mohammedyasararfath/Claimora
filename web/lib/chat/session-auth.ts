import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export const ANON_COOKIE = "claimora_anon_token";

export function generateAnonToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pre-auth visitors have no Supabase Auth session, so their chat_sessions row
 * can't be protected by ordinary RLS (auth.uid() is null for them). Instead,
 * a signed httpOnly cookie holds a random token that must match the row's
 * anon_token column — checked here, in application code, before any Route
 * Handler is allowed to read/write that session via the admin (service-role)
 * client. Once the session is claimed, visitor_user_id is backfilled and
 * everything moves under normal RLS.
 */
export async function getAuthorizedSession(sessionId: string) {
  const admin = createAdminClient();

  const { data: session, error } = await admin
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return { session: null, client: null, error: "session not found" as const };
  }

  // Check the anon cookie FIRST, even if visitor_user_id is now set. The AI
  // agent backfills visitor_user_id the instant it creates the visitor's
  // account (complete_claim/restricted_claim) — but that's a server-side
  // admin.createUser() call; the browser doesn't receive a real Supabase Auth
  // session until the visitor clicks the "set your password" email link. If
  // this check required real auth the moment visitor_user_id appears, the
  // same browser that had been polling this session all along would start
  // getting 403s mid-conversation, right as the AI sends its final message.
  // The cookie remains the source of truth for "is this the same browser
  // that started the session" until the visitor actually logs in for real.
  const cookieStore = await cookies();
  const token = cookieStore.get(ANON_COOKIE)?.value;

  if (session.anon_token && token && token === session.anon_token) {
    return { session, client: admin, error: null };
  }

  if (session.visitor_user_id) {
    // Authenticated session (or the visitor has since logged in for real) —
    // defer to normal RLS via the caller's own Supabase Auth session.
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== session.visitor_user_id) {
      return { session: null, client: null, error: "not authorized" as const };
    }

    return { session, client: supabase, error: null };
  }

  return { session: null, client: null, error: "not authorized" as const };
}

export type AuthorizedSession = Awaited<ReturnType<typeof getAuthorizedSession>>;
export type ChatSessionRow = Database["public"]["Tables"]["chat_sessions"]["Row"];
