import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";
import { requireClientEnv } from "./env";

// Server client for Route Handlers / Server Components / Server Actions.
// Uses the anon key + the caller's cookies, so it is fully RLS-scoped — this
// is the client 95% of server-side code should use. Use lib/supabase/admin.ts
// only for the small set of operations that must bypass RLS (see its own
// comment) and never expose it to anything that runs in the browser.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireClientEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireClientEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component with no response to attach cookies
            // to — safe to ignore because middleware.ts refreshes the session
            // on every request anyway.
          }
        },
      },
    },
  );
}
