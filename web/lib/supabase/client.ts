"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";
import { requireClientEnv } from "./env";

// Browser client: RLS-scoped by the signed-in user's JWT (or anonymous),
// safe to use directly from client components. Never import the service-role
// client (lib/supabase/admin.ts) anywhere under app/ that ships to the browser.
export function createClient() {
  return createBrowserClient<Database>(
    requireClientEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireClientEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
