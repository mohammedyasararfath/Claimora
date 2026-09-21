import { createClient } from "npm:@supabase/supabase-js@2";

// Service-role client for use ONLY inside Edge Functions / other trusted
// server contexts. This bypasses Row Level Security entirely — never import
// this pattern into any client-shipped code.
export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set for this function. " +
        "Supabase sets these automatically for deployed Edge Functions; for local " +
        "development run `supabase start` and `supabase functions serve --env-file .env`.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Set it with ` +
        `\`supabase secrets set ${name}=...\` (or in your local .env for ` +
        `\`supabase functions serve\`) before this function can run.`,
    );
  }
  return value;
}
