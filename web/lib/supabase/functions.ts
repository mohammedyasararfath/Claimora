import "server-only";

import { requireServerEnv } from "./env";
import { requireClientEnv } from "./env";

// Thin helper for calling Supabase Edge Functions from trusted server code
// (Route Handlers) using the service-role key. Never call this from a client
// component — the service-role key must never reach the browser.
export async function callEdgeFunction<T = unknown>(name: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${requireClientEnv("NEXT_PUBLIC_SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireServerEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}
