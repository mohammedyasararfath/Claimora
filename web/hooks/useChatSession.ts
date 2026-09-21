"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database.types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];

// Realtime subscription to one session's messages, for authenticated
// contexts where RLS resolves the caller's access correctly (staff in the
// agent console, or a signed-in profile owner). Pre-auth anonymous chat uses
// polling instead — see ChatPanel.tsx.
export function useChatSessionMessages(sessionId: string | null, initial: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);

  useEffect(() => {
    if (!sessionId) return;
    setMessages(initial);

    const supabase = createClient();
    const channel = supabase
      .channel(`chat-session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return messages;
}
