"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { decodePaymentForm, encodePaymentForm } from "@/lib/payments/paymentFormMarker";
import { PaymentFormMessage } from "./PaymentFormMessage";

// Exact copy from the artifact's DEFAULT_QUICK_QUESTIONS.
const DEFAULT_QUICK_QUESTIONS = [
  "Upgrade me to PRO",
  "How do I improve my Search Rank Score?",
  "What's the difference between Claimed and PRO?",
  "How do I get more reviews?",
  "How do I unpublish my profile?",
];

const POLL_INTERVAL_MS = 2500;

type Sender = "visitor" | "agent" | "system" | "liveagent";
type Message = { id: string; sender: Sender; body: string; agent_name?: string | null };

function composerPlaceholder(status: string, agentName: string | null): string {
  if (status === "live_waiting") return "Waiting for a live agent to join… you can keep typing";
  if (status === "live_active") return `Message ${agentName ?? "your agent"}…`;
  return "Type a message…";
}

function livePill(status: string, agentName: string | null): { label: string; className: string } | null {
  if (status === "live_waiting") return { label: "🟡 Waiting for a live agent", className: "bg-amber-soft text-amber" };
  if (status === "live_active") return { label: `🟢 Connected with ${agentName ?? "an agent"}`, className: "bg-mint-soft text-mint" };
  return null;
}

export function DashboardCopilot({ profileId }: { profileId: string }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [choices, setChoices] = useState<string[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"active" | "live_waiting" | "live_active">("active");
  const [agentName, setAgentName] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const nextLocalId = useRef(0);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages]);

  // Once escalated, this becomes a genuine live handoff — same polling
  // pattern ChatPanel.tsx uses for the claim flow, reusing the same
  // session-messages endpoint (it already authorizes an authenticated
  // visitor_user_id match, which is exactly what a dashboard session is).
  useEffect(() => {
    if (!sessionId || (status !== "live_waiting" && status !== "live_active")) return;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/agent/session/${sessionId}/messages`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const json = await res.json();
      setMessages(
        (json.messages ?? []).map((m: { id: string; sender: Sender; body: string; agent_name: string | null }) => ({
          id: m.id,
          sender: m.sender,
          body: m.body,
          agent_name: m.agent_name,
        })),
      );
      if (json.status) setStatus(json.status);
      if (json.agentName !== undefined) setAgentName(json.agentName);
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, status]);

  async function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body || sending) return;
    setSending(true);
    setInput("");
    setChoices(null);
    setMessages((prev) => [...prev, { id: `local-${nextLocalId.current++}`, sender: "visitor", body }]);

    try {
      if (status === "live_waiting" || status === "live_active") {
        // Human handoff already in progress — this is a plain message
        // insert, not an AI turn (the same distinction ChatPanel.tsx makes).
        const res = await fetch("/api/agent/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: body }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "message failed to send");
        return;
      }

      const res = await fetch("/api/dashboard/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: body,
          sessionId,
          history: messages.filter((m) => m.sender === "visitor" || m.sender === "agent").map((m) => ({ role: m.sender === "visitor" ? "user" : "assistant", content: m.body })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "the copilot had trouble responding");
      if (json.sessionId) setSessionId(json.sessionId);
      if (json.reply) setMessages((prev) => [...prev, { id: `local-${nextLocalId.current++}`, sender: "agent", body: json.reply }]);
      if (json.paymentForm) {
        setMessages((prev) => [
          ...prev,
          { id: `local-${nextLocalId.current++}`, sender: "agent", body: encodePaymentForm(json.paymentForm) },
        ]);
      }
      if (json.choices) setChoices(json.choices);
      if (json.handedOff) setStatus("live_waiting");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  const quickOptions = choices ?? DEFAULT_QUICK_QUESTIONS;
  const pill = livePill(status, agentName);

  return (
    <div className="flex h-[min(75vh,720px)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <p className="flex-shrink-0 text-sm font-semibold">AI Copilot — profile &amp; SRS help</p>
        {pill && (
          <span
            className={cn("min-w-0 truncate rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", pill.className)}
          >
            {pill.label}
          </span>
        )}
      </div>

      <div ref={transcriptRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="rounded-lg bg-violet-soft p-3 text-sm">
            Ask me anything about your profile or Search Rank Score — or pick a quick question below.
          </div>
        )}
        {messages.map((m) => {
          const paymentForm = decodePaymentForm(m.body);
          return (
          <div key={m.id}>
            {paymentForm ? (
              <PaymentFormMessage profileId={profileId} payload={paymentForm} />
            ) : m.sender === "system" ? (
              <p className="text-center text-xs text-ink-soft">{m.body}</p>
            ) : (
              <div
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-sm",
                  m.sender === "visitor" ? "ml-auto bg-indigo-soft text-ink" : "bg-violet-soft text-ink",
                )}
              >
                {m.sender === "liveagent" && m.agent_name && (
                  <p className="mb-0.5 text-[0.65rem] font-bold uppercase text-ink-soft">{m.agent_name}</p>
                )}
                {m.body}
              </div>
            )}
          </div>
          );
        })}
        {sending && (
          <div className="max-w-[92%] rounded-lg bg-violet-soft px-3 py-2">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet" />
              <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet [animation-delay:0.18s]" />
              <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-violet [animation-delay:0.36s]" />
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-line p-2.5">
        {status === "active" && (
          <select
            className="mb-2 w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink-soft"
            value=""
            disabled={sending}
            onChange={(e) => {
              if (e.target.value) send(e.target.value);
            }}
          >
            <option value="">{choices ? "Choose an option…" : "Quick questions…"}</option>
            {quickOptions.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        )}
        {status === "active" && (
          <button
            type="button"
            disabled={sending}
            onClick={() => send("I'd like to talk to a person about my account.")}
            className="mb-2 w-full rounded-md border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
          >
            🧑 Talk to an Agent
          </button>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={composerPlaceholder(status, agentName)}
            className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-md bg-violet px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "active" ? "Ask" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
