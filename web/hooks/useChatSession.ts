"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database.types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];

// Realtime subscription to one session's messages, for authenticated
// contexts where RLS resolves the caller's access correctly (staff in the
// agent console, or a signed-in profile owner). Pre-auth anonymous chat uses
// polling instead — see ChatPanel.tsx.
//
// Self-contained: fetches history itself rather than trusting a parent's
// `initial` prop, which arrives from its own separate async fetch — tying
// this hook's effect only to `sessionId` (which never changes for a given
// panel) meant it captured whatever `initial` was at first render (usually
// still `[]`) and never re-synced once the parent's fetch actually resolved,
// so historical messages silently never appeared until a new one arrived.
export function useChatSessionMessages(sessionId: string | null, initial: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data);
      });

    const channel = supabase
      .channel(`chat-session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as ChatMessage).id) ? prev : [...prev, payload.new as ChatMessage],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return messages;
}
