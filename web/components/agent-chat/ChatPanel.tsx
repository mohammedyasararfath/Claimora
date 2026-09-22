"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database.types";

type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
type Profile = {
  id: string;
  name: string;
  category: string;
  city: string | null;
  brokerage: string | null;
  license: string | null;
  phone: string | null;
  email: string | null;
} | null;
type PreVerified = { channel?: string; contact?: string } | "restricted" | null;
type GraphRead = { field_name: string; value_returned: string | null };
type OpenQuestion = { topic: string };

const POLL_INTERVAL_MS = 2500;
const TRACK_STEPS = ["Identify", "Verify / Details", "Confirm", "Done"];

function currentTrackIndex(
  status: string,
  mode: "claim" | "create",
  fields: Record<string, unknown>,
  preVerified: PreVerified,
  graphReadsCount: number,
): number {
  if (status === "claimed" || status === "handed_off") return 3;
  if (status === "ready_to_claim") return 2;
  if (mode === "claim") {
    if (fields.login_email || fields.license_confirmed) return 2;
    if (preVerified || graphReadsCount > 0) return 1;
    return 0;
  }
  const n = ["full_name", "category", "city"].filter((k) => !!fields[k]).length;
  if (n >= 3) return 2;
  if (n > 0) return 1;
  return 0;
}

function suggestionsFor(mode: "claim" | "create", preVerified: PreVerified): string[] {
  if (mode === "claim") {
    if (preVerified === "restricted") {
      return [
        "Go ahead and submit it for review",
        "How long does manual review take?",
        "Someone else already claimed this and it's not them",
      ];
    }
    if (preVerified) {
      return [
        "Great, let's finish claiming it",
        "Can I use a different login email?",
        "Someone else already claimed this and it's not them",
      ];
    }
    return [
      "Yes, this is me — how do I claim it?",
      "I don't have access to that email or phone anymore",
      "Someone else already claimed this and it's not them",
    ];
  }
  return ["Sure, let's build my profile", "I'm not sure what category I fit", "What do you need from me?"];
}

function composerPlaceholder(status: string, agentName: string | null): string {
  if (status === "ready_to_claim") return "Review the confirmation above to finish";
  if (status === "claimed" || status === "handed_off") return "This conversation is complete";
  if (status === "live_waiting") return "Waiting for a live agent to join… you can keep typing";
  if (status === "live_active") return `Message ${agentName ?? "your agent"}…`;
  return "Type your message…";
}

function livePill(status: string, agentName: string | null): { label: string; className: string } | null {
  if (status === "live_waiting") return { label: "🟡 Waiting for a live agent", className: "bg-amber-soft text-amber" };
  if (status === "live_active") return { label: `🟢 Connected with ${agentName ?? "an agent"}`, className: "bg-mint-soft text-mint" };
  return null;
}

// In claim mode, "What we have so far" should show the profile's own
// on-file details right away — that's the whole premise of claiming
// ("we already have your details, just confirm it's you") — not wait for
// the AI to happen to re-record them mid-conversation. A visitor-recorded
// field always wins over the on-file value (they're correcting it).
function identifyRows(
  profile: Profile,
  fields: Record<string, unknown>,
  preVerified: PreVerified,
  claimSource: string | null,
): [string, string, boolean?][] {
  if (!profile) return [];
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const restricted = preVerified === "restricted";

  const email = restricted ? (str(fields.login_email) ?? profile.email) : (str(fields.contact_email) ?? profile.email);
  const verification = restricted
    ? "Alternate email — pending manual review"
    : preVerified && typeof preVerified === "object"
      ? `✓ Verified via ${preVerified.channel}`
      : null;

  const rows: [string, string | null, boolean?][] = [
    ["Full name", str(fields.full_name) ?? profile.name],
    ["Category", str(fields.category) ?? profile.category],
    ["City", str(fields.city) ?? profile.city],
    ["License", str(fields.license) ?? profile.license, true],
    ["Verification", verification],
    ["Claimed through", claimSource],
    ["Brokerage", str(fields.brokerage) ?? profile.brokerage, true],
    ["Phone", str(fields.contact_phone) ?? profile.phone],
    ["Email", email],
  ];
  return rows.filter((r): r is [string, string, boolean?] => !!r[1]);
}

export function ChatPanel({
  sessionId,
  mode,
  status: initialStatus,
  initialMessages,
  initialFields,
  initialBioState,
  initialPreVerified,
  profile,
  claimSource,
}: {
  sessionId: string;
  mode: "claim" | "create";
  status: string;
  initialMessages: ChatMessage[];
  initialFields: Record<string, unknown>;
  initialBioState: { text?: string; status?: string } | null;
  initialPreVerified: PreVerified;
  profile: Profile;
  claimSource?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [fields, setFields] = useState(initialFields);
  const [bioState, setBioState] = useState(initialBioState);
  const [preVerified, setPreVerified] = useState<PreVerified>(initialPreVerified);
  const [intent, setIntent] = useState<string | null>(null);
  const [graphReads, setGraphReads] = useState<GraphRead[]>([]);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestion[]>([]);
  const [choices, setChoices] = useState<string[] | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages]);

  function applyPollResult(json: {
    messages?: ChatMessage[];
    fields?: Record<string, unknown>;
    bioState?: { text?: string; status?: string } | null;
    status?: string;
    preVerified?: PreVerified;
    intent?: string | null;
    graphReads?: GraphRead[];
    openQuestions?: OpenQuestion[];
    agentName?: string | null;
  }) {
    setMessages(json.messages ?? []);
    if (json.fields) setFields(json.fields);
    if (json.bioState) setBioState(json.bioState);
    if (json.preVerified !== undefined) setPreVerified(json.preVerified);
    if (json.intent !== undefined) setIntent(json.intent);
    if (json.graphReads) setGraphReads(json.graphReads);
    if (json.openQuestions) setOpenQuestions(json.openQuestions);
    if (json.agentName !== undefined) setAgentName(json.agentName);
    if (json.status && json.status !== status) setStatus(json.status);
    if (json.status === "claimed") router.refresh();
  }

  useEffect(() => {
    if (status !== "active" && status !== "live_waiting" && status !== "live_active" && status !== "ready_to_claim") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/agent/session/${sessionId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      applyPollResult(await res.json());
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  const autoSentRef = useRef(false);

  useEffect(() => {
    // The "Tell the Copilot instead" freeform path stores the visitor's
    // opening text as fields.initial_intent (see /api/claim/start) but never
    // turns it into an actual chat message — without this, the visitor lands
    // on a completely empty transcript and has to retype what they already
    // wrote before the AI responds at all.
    if (autoSentRef.current) return;
    if (messages.length > 0) return;
    const initialIntent = initialFields.initial_intent;
    if (typeof initialIntent !== "string" || !initialIntent.trim()) return;

    autoSentRef.current = true;
    send(initialIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body || sending) return;
    setSending(true);
    setInput("");
    setChoices(null);
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
      if (json.choices) setChoices(json.choices);

      const refreshed = await fetch(`/api/agent/session/${sessionId}/messages`, { cache: "no-store" });
      applyPollResult(await refreshed.json());
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
        body: JSON.stringify({ type: "claim", sessionId, reason: "direct request" }),
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

  // Bio acceptance is the one thing the AI has no reliable way to detect
  // from free text — propose_bio always (re)sets status to "proposed", and
  // nothing else can ever flip it to "accepted", which otherwise makes
  // complete_claim's bio-acceptance gate for new profiles unreachable. This
  // marks it accepted directly, then sends a normal message so the AI's next
  // turn sees the now-accepted state and proceeds to finish the claim.
  async function acceptBio() {
    try {
      const res = await fetch(`/api/agent/session/${sessionId}/bio-accept`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not accept the bio");
      setBioState((prev) => (prev ? { ...prev, status: "accepted" } : prev));
      await send("Looks good, let's finish!");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  function startEditBio() {
    setBioDraft(bioState?.text ?? "");
    setEditingBio(true);
  }

  async function saveBioEdit() {
    const text = bioDraft.trim();
    if (!text) return;
    setEditingBio(false);
    await send(`Please use this exact bio instead, word for word: "${text}"`);
  }

  const realMessages = messages.filter((m) => m.sender !== "system");
  const showSuggestions = realMessages.length === 0 && status === "active";
  const trackIdx = currentTrackIndex(status, mode, fields, preVerified, graphReads.length);
  // In claim mode, identifyRows already covers full_name/category/city/license/
  // brokerage/contact_phone/contact_email (sourced from the on-file profile,
  // overridden by whatever the AI has recorded) — only show anything else the
  // AI records here, so nothing appears twice.
  const CLAIM_KNOWN_KEYS = ["full_name", "category", "city", "license", "brokerage", "contact_phone", "contact_email", "login_email"];
  const otherFields = Object.entries(fields).filter(
    ([k]) =>
      !k.startsWith("_") &&
      k !== "login_email" &&
      k !== "initial_intent" && // already shown as the first chat message — not a captured profile field
      !(mode === "claim" && CLAIM_KNOWN_KEYS.includes(k)),
  );
  const claimRows = mode === "claim" ? identifyRows(profile, fields, preVerified, claimSource ?? null) : [];
  const pill = livePill(status, agentName);

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {TRACK_STEPS.map((label, i) => (
          <div key={label} className="flex-1 text-center">
            <div
              className={cn(
                "mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                i === trackIdx ? "bg-violet text-white" : i < trackIdx ? "bg-violet text-white" : "bg-line text-ink-soft",
              )}
            >
              {i < trackIdx ? "✓" : i + 1}
            </div>
            <div className={cn("text-[0.68rem]", i === trackIdx ? "font-semibold text-violet" : "text-ink-soft")}>{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="rounded-lg border border-line bg-card p-4">
          <h3 className="mb-3 font-serif text-base font-semibold">What we have so far</h3>
          <dl className="flex flex-col gap-2 text-sm">
            {claimRows.map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-dashed border-line py-1">
                <dt className="text-ink-soft">{label}</dt>
                <dd className={cn("font-semibold", label === "Verification" && preVerified === "restricted" ? "text-amber" : "text-mint")}>
                  {value}
                </dd>
              </div>
            ))}
            {otherFields.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-dashed border-line py-1">
                <dt className="text-ink-soft">{k.replace(/_/g, " ")}</dt>
                <dd className="font-semibold text-mint">{String(v)}</dd>
              </div>
            ))}
            {otherFields.length === 0 && claimRows.length === 0 && !preVerified && (
              <p className="text-sm italic text-ink-soft">Nothing recorded yet — start chatting on the right.</p>
            )}
          </dl>
          {bioState?.text && (
            <div className="mt-4 rounded-lg border border-line bg-paper p-3">
              <p className="mb-1 text-xs font-bold uppercase text-ink-soft">Proposed bio</p>
              {editingBio ? (
                <>
                  <Textarea
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    className="mb-2 min-h-[80px] text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" onClick={saveBioEdit} disabled={sending || !bioDraft.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingBio(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">{bioState.text}</p>
                  <p className="mt-1 text-xs text-ink-soft">Status: {bioState.status}</p>
                  {bioState.status !== "accepted" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="success" onClick={acceptBio} disabled={sending}>
                        Accept & Continue
                      </Button>
                      <Button size="sm" variant="outline" onClick={startEditBio}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={sending}
                        onClick={() => send("Can you write a different version of the bio?")}
                      >
                        Regenerate
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-[520px] flex-col rounded-lg border border-line bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-soft">
            <span>
              You&apos;re chatting with Claimora&apos;s AI copilot. A human may join if needed — you&apos;ll always be
              told when that happens.
            </span>
            {pill && (
              <span className={cn("flex-shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold", pill.className)}>
                {pill.label}
              </span>
            )}
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

          {showSuggestions && (
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
              {suggestionsFor(mode, preVerified).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={sending}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-violet hover:text-violet"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {choices && choices.length > 0 && (
            <div className="px-3.5 pb-2.5">
              <select
                className="w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink-soft"
                value=""
                disabled={sending}
                onChange={(e) => {
                  if (e.target.value) send(e.target.value);
                }}
              >
                <option value="">Choose an option…</option>
                {choices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <form
            className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={composerPlaceholder(status, agentName)}
              aria-label="Message"
              disabled={status === "claimed" || status === "handed_off"}
              className="min-w-0 flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" variant="ai" disabled={sending || !input.trim()} className="flex-1 sm:flex-initial">
                Send
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={talkToHuman}
                disabled={status !== "active"}
                className="flex-1 sm:flex-initial"
              >
                Talk to a person
              </Button>
            </div>
          </form>

          <details className="border-t border-line bg-paper">
            <summary className="cursor-pointer px-3.5 py-2 text-xs font-semibold text-ink-soft">Behind the scenes</summary>
            <div className="px-3.5 pb-3 text-xs">
              <div className="flex gap-2 border-b border-dashed border-line py-1">
                <span className="w-20 flex-shrink-0 font-mono text-[0.68rem] text-ink-soft">intent</span>
                <span className={intent ? "" : "italic text-ink-soft"}>{intent ?? "not captured yet"}</span>
              </div>
              {graphReads.map((g, i) => (
                <div key={i} className="font-mono text-[0.68rem] text-ink-soft">
                  graph read → <b>{g.field_name}</b>: {String(g.value_returned)}
                </div>
              ))}
              {openQuestions.map((q, i) => (
                <div key={i} className="font-mono text-[0.68rem] text-amber">
                  ⚠ open question → {q.topic}
                </div>
              ))}
            </div>
          </details>
        </div>
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
