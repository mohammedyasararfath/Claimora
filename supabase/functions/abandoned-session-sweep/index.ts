// POST /functions/v1/abandoned-session-sweep
// Scheduled job: any chat_sessions row with no new chat_messages for 30+
// minutes and a non-terminal status gets marked 'abandoned' and gets a
// follow-up live_agent_requests row created (abandoned=true), so a visitor
// who simply closed the tab still gets a human follow-up — the prototype only
// creates this on a same-tab navigation event, which misses a plain tab close.

import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const IDLE_MINUTES = 30;
// Must be real chat_status enum values (0004_chat.sql: active, live_waiting,
// live_active, ready_to_claim, claimed, handed_off, abandoned) — this
// previously listed "resolved", which isn't a chat_status at all (it's a
// live_agent_requests.status value), so this query 500'd on every single
// invocation and the sweep never ran even after being deployed.
const TERMINAL_STATUSES = ["claimed", "handed_off", "abandoned"];

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const supabase = supabaseAdmin();
    const cutoff = new Date(Date.now() - IDLE_MINUTES * 60_000).toISOString();

    const { data: candidates, error } = await supabase
      .from("chat_sessions")
      .select("id, mode, profile_id, status, updated_at, fields")
      .lt("updated_at", cutoff)
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .limit(100);

    if (error) throw error;

    let flagged = 0;

    for (const session of candidates ?? []) {
      const { data: existing } = await supabase
        .from("live_agent_requests")
        .select("id")
        .eq("session_id", session.id)
        .maybeSingle();
      if (existing) continue; // already escalated (live-waiting etc.) — don't double up

      await supabase
        .from("live_agent_requests")
        .insert({
          type: "claim",
          session_id: session.id,
          profile_id: session.profile_id,
          reason: "abandoned",
          summary: "Visitor left this conversation without finishing — no live channel was open, so reach out by phone/email if available.",
          abandoned: true,
          ai_snapshot_message_count: 0,
        });

      await supabase.from("chat_sessions").update({ status: "abandoned" }).eq("id", session.id);

      await supabase.from("agent_events").insert({
        session_id: session.id,
        surface: session.mode === "claim" ? "Claim agent" : "Create agent",
        outcome: "abandoned",
      });

      flagged += 1;
    }

    return jsonResponse({ flagged, checked: candidates?.length ?? 0 });
  } catch (err) {
    console.error("abandoned-session-sweep error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
