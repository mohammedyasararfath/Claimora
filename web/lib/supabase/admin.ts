import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { requireClientEnv, requireServerEnv } from "./env";

// Service-role client: bypasses Row Level Security entirely. Restricted to a
// short, deliberate list of server-only call sites — issuing a signed claim
// session cookie before an account exists, and admin-only aggregate reads
// that are already gated by the /admin route's own auth check. Every other
// server-side read/write should go through lib/supabase/server.ts so RLS
// stays the actual enforcement boundary, not a convention some code follows.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireClientEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
