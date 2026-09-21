"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database.types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
type Profile = { id: string; name: string; category: string; city: string | null; brokerage: string | null } | null;

const POLL_INTERVAL_MS = 2500;

export function ChatPanel({
  sessionId,
  mode,
  status: initialStatus,
  initialMessages,
  initialFields,
  initialBioState,
  profile,
}: {
  sessionId: string;
  mode: "claim" | "create";
  status: string;
  initialMessages: ChatMessage[];
  initialFields: Record<string, unknown>;
  initialBioState: { text?: string; status?: string } | null;
  profile: Profile;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [fields, setFields] = useState(initialFields);
  const [bioState, setBioState] = useState(initialBioState);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (status !== "active" && status !== "live_waiting" && status !== "live_active" && status !== "ready_to_claim") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/agent/session/${sessionId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages ?? []);
      if (json.fields) setFields(json.fields);
      if (json.bioState) setBioState(json.bioState);
      if (json.status && json.status !== status) setStatus(json.status);
      if (json.status === "claimed") {
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  async function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `optimistic-${Date.now()}`, session_id: sessionId, sender: "visitor", agent_name: null, body, is_open_question: false, created_at: new Date().toISOString() } as ChatMessage,
    ]);

    try {
      const res = await fetch("/api/agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "the copilot had trouble responding");

      const refreshed = await fetch(`/api/agent/session/${sessionId}/messages`, { cache: "no-store" });
      const refreshedJson = await refreshed.json();
      setMessages(refreshedJson.messages ?? []);
      if (refreshedJson.fields) setFields(refreshedJson.fields);
      if (refreshedJson.bioState) setBioState(refreshedJson.bioState);
      if (refreshedJson.status) setStatus(refreshedJson.status);
      if (refreshedJson.status === "claimed") router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  async function talkToHuman() {
    try {
      const res = await fetch("/api/live-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mode === "create" ? "claim" : "claim", sessionId, reason: "direct request" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not connect you");
      setStatus("live_waiting");
      toast("Connecting you with a team member…", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function confirmClaim() {
    try {
      const res = await fetch("/api/claim/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not confirm — please log in first");
      router.push(`/claimed/${profile?.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="mb-3 font-serif text-base font-semibold">What we have so far</h3>
        <dl className="flex flex-col gap-2 text-sm">
          {Object.entries(fields)
            .filter(([k]) => !k.startsWith("_"))
            .map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-dashed border-line py-1">
                <dt className="text-ink-soft">{k.replace(/_/g, " ")}</dt>
                <dd className="font-semibold text-mint">{String(v)}</dd>
              </div>
            ))}
          {Object.keys(fields).filter((k) => !k.startsWith("_")).length === 0 && (
            <p className="text-sm italic text-ink-soft">Nothing recorded yet — start chatting on the right.</p>
          )}
        </dl>
        {bioState?.text && (
          <div className="mt-4 rounded-lg border border-line bg-paper p-3">
            <p className="mb-1 text-xs font-bold uppercase text-ink-soft">Proposed bio</p>
            <p className="text-sm">{bioState.text}</p>
            <p className="mt-1 text-xs text-ink-soft">Status: {bioState.status}</p>
          </div>
        )}
      </div>

      <div className="flex min-h-[520px] flex-col rounded-lg border border-line bg-card">
        <div className="border-b border-line px-4 py-2.5 text-xs text-ink-soft">
          You&apos;re chatting with Claimora&apos;s AI copilot. A human may join if needed — you&apos;ll always be
          told when that happens.
        </div>

        {status === "ready_to_claim" && (
          <div className="m-3.5 flex items-center justify-between gap-2 rounded-lg border border-mint bg-mint-soft p-3 text-sm">
            <span>A team member has finished verifying your claim.</span>
            <Button size="sm" variant="success" onClick={confirmClaim}>
              Confirm & finish
            </Button>
          </div>
        )}

        <div ref={transcriptRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" role="log" aria-live="polite">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {sending && (
            <div className="self-start rounded-xl rounded-tl-sm bg-violet-soft px-3 py-2">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet [animation-delay:0.18s]" />
                <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet [animation-delay:0.36s]" />
              </span>
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            aria-label="Message"
            disabled={status === "claimed" || status === "handed_off"}
          />
          <Button type="submit" variant="ai" disabled={sending || !input.trim()}>
            Send
          </Button>
          <Button type="button" variant="ghost" onClick={talkToHuman} disabled={status !== "active"}>
            Talk to a person
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.sender === "system") {
    return (
      <div className="self-center rounded-md border border-dashed border-line px-3 py-1 text-center text-xs text-ink-soft">
        {message.body}
      </div>
    );
  }

  const isVisitor = message.sender === "visitor";
  const isLiveAgent = message.sender === "liveagent";

  return (
    <div className={cn("max-w-[86%]", isVisitor ? "self-end text-right" : "self-start")}>
      {isLiveAgent && <p className="mb-0.5 text-xs font-bold text-slate">{message.agent_name ?? "Support"}</p>}
      <div
        className={cn(
          "rounded-xl px-3.5 py-2 text-sm",
          isVisitor && "rounded-tr-sm bg-indigo-soft",
          message.sender === "agent" && cn("rounded-tl-sm bg-violet-soft", message.is_open_question && "border border-amber"),
          isLiveAgent && "rounded-tl-sm bg-slate-soft",
        )}
      >
        {message.body}
        {message.is_open_question && (
          <span className="mt-1 block text-xs font-semibold text-amber">⚠ flagged for human review</span>
        )}
      </div>
    </div>
  );
}
