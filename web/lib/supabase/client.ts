"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

// Browser client: RLS-scoped by the signed-in user's JWT (or anonymous),
// safe to use directly from client components. Never import the service-role
// client (lib/supabase/admin.ts) anywhere under app/ that ships to the browser.
//
// IMPORTANT: these two env reads must stay exactly as literal
// `process.env.NEXT_PUBLIC_X` expressions. Next.js/webpack only inlines
// NEXT_PUBLIC_ vars into the client bundle when it can statically match that
// exact literal pattern at build time — routing this through a helper
// function that does `process.env[name]` (dynamic bracket access with a
// variable) can't be statically analyzed, so it silently resolves to
// `undefined` in the browser at runtime no matter what's actually configured
// in Vercel. (Server-side code doesn't have this restriction — the server
// runtime has a real process.env object — so lib/supabase/env.ts's dynamic
// helpers remain fine to use everywhere else.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY at build time. " +
        "These must be set wherever `next build` actually runs (Vercel project env vars, " +
        "or web/.env.local for a local build) — setting them only at runtime is not enough.",
    );
  }
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
