import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// These evals call the real deployed edge functions and a real Anthropic
// model against dedicated fixture profiles (slugs eval-fixture-unclaimed /
// eval-fixture-claimed — see the seed step in README.md). They are
// deliberately NOT picked up by the default `npm test` (vitest's default
// include glob is *.test.ts; these are *.eval.ts, run via `npm run
// test:evals`) since they need real network access, cost real model tokens,
// and are inherently a little slower/flakier than unit tests — behavioral
// assertions against a live model, not deterministic snapshots.
function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env.local");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();

function requireEnv(name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name} in web/.env.local`);
  return value;
}

export const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export const admin = createClient(supabaseUrl, serviceRoleKey);

export async function callEdgeFunction<T = Record<string, unknown>>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${name} returned ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

// A fresh chat_sessions row already past OTP verification (pre_verified set
// directly), matching what a real claim-email-link click produces — lets a
// claim-flow eval start straight at "Confirm" without re-testing the OTP
// step every single case.
export async function createClaimSession(profileId: string, fields: Record<string, string> = {}) {
  const { data, error } = await admin
    .from("chat_sessions")
    .insert({
      mode: "claim",
      status: "active",
      profile_id: profileId,
      pre_verified: { channel: "email", contact: "eval-fixture-unclaimed@example.com" },
      fields,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create eval claim session: ${error?.message}`);
  return data.id as string;
}

export async function cleanupSession(sessionId: string) {
  // Detach the two other FK edges a hand_off/escalation could have left
  // pointing at this session before deleting it — see
  // dashboard-copilot.eval.ts's afterEach for the same fix, needed there
  // first.
  await admin.from("agent_events").update({ session_id: null }).eq("session_id", sessionId);
  await admin.from("chat_sessions").update({ live_request_id: null }).eq("id", sessionId);
  await admin.from("live_agent_requests").delete().eq("session_id", sessionId);
  await admin.from("chat_messages").delete().eq("session_id", sessionId);
  await admin.from("chat_sessions").delete().eq("id", sessionId);
}

export const FIXTURE_UNCLAIMED_SLUG = "eval-fixture-unclaimed";
export const FIXTURE_CLAIMED_SLUG = "eval-fixture-claimed";

export async function getFixtureProfile(slug: string) {
  const { data, error } = await admin.from("profiles").select("*").eq("slug", slug).single();
  if (error || !data) throw new Error(`fixture profile "${slug}" not found — see README.md's seed step`);
  return data;
}
