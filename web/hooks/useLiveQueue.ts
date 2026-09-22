"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database.types";

type LiveRequest = Database["public"]["Tables"]["live_agent_requests"]["Row"];

// Staff members are real authenticated users, so RLS's is_staff() check
// resolves correctly for them — this is genuine Supabase Realtime, unlike
// the polling fallback anonymous pre-auth chat sessions use (see
// app/api/agent/session/[sessionId]/messages/route.ts for why).
export function useLiveQueue(initial: LiveRequest[]) {
  const [requests, setRequests] = useState<LiveRequest[]>(initial);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // The realtime socket only gets the signed-in JWT once the session has
    // loaded from cookies — that happens asynchronously, so subscribing
    // immediately after createClient() can open the channel as anonymous,
    // which RLS then silently filters every event out of (no error, just
    // nothing ever arrives). Awaiting the session first guarantees the
    // socket carries staff auth before postgres_changes events can fire.
    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel("live-agent-queue")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "live_agent_requests" },
          (payload) => {
            setRequests((prev) => {
              if (payload.eventType === "INSERT") {
                const row = payload.new as LiveRequest;
                return row.status === "waiting" || row.status === "active" ? [row, ...prev] : prev;
              }
              if (payload.eventType === "UPDATE") {
                const row = payload.new as LiveRequest;
                if (row.status !== "waiting" && row.status !== "active") {
                  return prev.filter((r) => r.id !== row.id);
                }
                return prev.map((r) => (r.id === row.id ? row : r));
              }
              if (payload.eventType === "DELETE") {
                return prev.filter((r) => r.id !== (payload.old as LiveRequest).id);
              }
              return prev;
            });
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return requests;
}
