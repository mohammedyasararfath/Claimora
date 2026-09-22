"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/useToast";
import { useChatSessionMessages } from "@/hooks/useChatSession";
import type { Database } from "@/lib/types/database.types";

type LiveRequest = Database["public"]["Tables"]["live_agent_requests"]["Row"];
type Requirement = Database["public"]["Tables"]["live_agent_requirements"]["Row"];
type Note = Database["public"]["Tables"]["live_agent_notes"]["Row"];
type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];
type EditableFields = {
  full_name: string;
  category: string;
  city: string;
  brokerage: string;
  license: string;
  contact_phone: string;
  contact_email: string;
};
type Subscription = {
  cycle: string;
  status: string;
  current_period_end: string | null;
  packages: { name: string; monthly_price_cents: number; yearly_price_cents: number } | null;
};
type PkgSnapshot = {
  cycle: "monthly" | "yearly";
  addonApplied: boolean;
  dueTodayCents: number;
  packageName: string;
  sentAt: string;
  sentBy?: string;
};
type Quote = {
  coreCents: number;
  addonCents: number;
  dueTodayCents: number;
  unitLabel: string;
};

const FIELD_LABELS: Record<keyof EditableFields, string> = {
  full_name: "Full name",
  category: "Category",
  city: "City",
  brokerage: "Brokerage",
  license: "License",
  contact_phone: "Phone",
  contact_email: "Email",
};

export function RequestDetailPanel({ request }: { request: LiveRequest }) {
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [editableFields, setEditableFields] = useState<EditableFields | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [noteText, setNoteText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingFields, setSavingFields] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showPackagePicker, setShowPackagePicker] = useState(false);
  const [pickCycle, setPickCycle] = useState<"monthly" | "yearly">("yearly");
  const [pickAddon, setPickAddon] = useState(false);
  const [pickQuote, setPickQuote] = useState<Quote | null>(null);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/live-queue/${request.id}`)
      .then((r) => r.json())
      .then((json) => {
        setRequirements(json.requirements ?? []);
        setNotes(json.notes ?? []);
        setInitialMessages(json.messages ?? []);
        setEditableFields(json.editableFields ?? null);
        setSubscription(json.subscription ?? null);
      })
      .finally(() => setLoading(false));
  }, [request.id]);

  const pkgSnapshot = (request.pkg_snapshot as PkgSnapshot | null) ?? null;

  useEffect(() => {
    if (pkgSnapshot?.cycle) setPickCycle(pkgSnapshot.cycle);
    if (typeof pkgSnapshot?.addonApplied === "boolean") setPickAddon(pkgSnapshot.addonApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  useEffect(() => {
    if (!showPackagePicker) return;
    const params = new URLSearchParams({ cycle: pickCycle, addon: String(pickAddon) });
    fetch(`/api/packages/quote?${params}`)
      .then((r) => r.json())
      .then(setPickQuote)
      .catch(() => toast("Could not load pricing", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPackagePicker, pickCycle, pickAddon]);

  async function sendPaymentRequest() {
    setSendingPayment(true);
    try {
      const res = await fetch(`/api/live-queue/${request.id}/payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle: pickCycle, addon: pickAddon }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not send payment request");
      toast("Payment form sent to visitor", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSendingPayment(false);
    }
  }

  async function checkPaymentStatus() {
    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/live-queue/${request.id}`);
      const json = await res.json();
      setSubscription(json.subscription ?? null);
      toast(
        json.subscription
          ? `Subscription status: ${json.subscription.status}`
          : request.conversion_status === "payment_succeeded"
            ? "Payment succeeded"
            : "No payment yet",
        "success",
      );
    } finally {
      setCheckingStatus(false);
    }
  }

  async function saveFields() {
    if (!editableFields) return;
    setSavingFields(true);
    try {
      const res = await fetch(`/api/live-queue/${request.id}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: editableFields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not save");
      toast(json.changed > 0 ? `Saved ${json.changed} change${json.changed === 1 ? "" : "s"}` : "No changes to save", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingFields(false);
    }
  }

  const messages = useChatSessionMessages(request.session_id, initialMessages);

  async function accept() {
    if (accepting) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/live-queue/${request.id}/accept`, { method: "POST" });
      if (!res.ok) toast((await res.json()).error ?? "could not accept", "error");
    } finally {
      setAccepting(false);
    }
  }

  async function resolve() {
    const res = await fetch(`/api/live-queue/${request.id}/resolve`, { method: "POST" });
    if (!res.ok) toast((await res.json()).error ?? "could not resolve", "error");
    else toast("Marked resolved", "success");
  }

  async function toggleRequirement(reqId: string, done: boolean) {
    setRequirements((prev) => prev.map((r) => (r.id === reqId ? { ...r, done } : r)));
    await fetch(`/api/live-queue/${request.id}/requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    const res = await fetch(`/api/live-queue/${request.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText.trim() }),
    });
    if (res.ok) {
      setNotes((prev) => [{ id: `local-${Date.now()}`, request_id: request.id, agent_user_id: null, note: noteText.trim(), created_at: new Date().toISOString() }, ...prev]);
      setNoteText("");
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const body = chatInput.trim();
    setChatInput("");
    const res = await fetch(`/api/live-queue/${request.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) toast((await res.json()).error ?? "message failed to send", "error");
  }

  const aiCutoff = request.ai_snapshot_message_count;

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="mb-3 rounded-lg border border-line p-3 text-sm">
            <div className="flex justify-between border-b border-dashed border-line py-1">
              <span className="text-ink-soft">Type</span>
              <span className="font-semibold capitalize">{request.type}</span>
            </div>
            <div className="flex justify-between border-b border-dashed border-line py-1">
              <span className="text-ink-soft">Reason</span>
              <span>{request.reason ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-soft">Status</span>
              <span className="font-semibold">{request.status}</span>
            </div>
          </div>
          <p className="mb-3 text-sm">{request.summary}</p>

          {request.type === "upgrade" && (
            <>
              <div className="mb-3 rounded-lg border border-line p-3 text-sm">
                <div className="flex justify-between border-b border-dashed border-line py-1">
                  <span className="text-ink-soft">Current tier</span>
                  <span className="font-semibold capitalize">{request.current_tier ?? "—"}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-line py-1">
                  <span className="text-ink-soft">Current SRS</span>
                  <span className="font-semibold">{request.current_srs ?? "—"} / 850</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-line py-1">
                  <span className="text-ink-soft">Category</span>
                  <span className="font-semibold">{editableFields?.category || "—"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-soft">City</span>
                  <span className="font-semibold">{editableFields?.city || "—"}</span>
                </div>
              </div>

              <div className="mb-3 rounded-lg border border-line p-3 text-sm">
                <p className="mb-2 text-xs font-bold uppercase text-ink-soft">Package under discussion</p>
                {subscription ? (
                  <>
                    <div className="flex justify-between border-b border-dashed border-line py-1">
                      <span className="text-ink-soft">Plan</span>
                      <span className="font-semibold">{subscription.packages?.name ?? "—"}</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-line py-1">
                      <span className="text-ink-soft">Billing frequency</span>
                      <span className="font-semibold capitalize">{subscription.cycle}</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-line py-1">
                      <span className="text-ink-soft">Status</span>
                      <span className="font-semibold capitalize">{subscription.status}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-ink-soft">Conversion status</span>
                      <span className="font-semibold capitalize">{request.conversion_status ?? "discussing"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-ink-soft">No package selected yet.</p>
                    <div className="flex justify-between py-1">
                      <span className="text-ink-soft">Conversion status</span>
                      <span className="font-semibold capitalize">{request.conversion_status ?? "discussing"}</span>
                    </div>
                  </>
                )}
              </div>

              {pkgSnapshot && (
                <p className="mb-2 text-[0.7rem] text-ink-soft">
                  Last sent: {pkgSnapshot.packageName} ({pkgSnapshot.cycle}) by {pkgSnapshot.sentBy ?? "you"} at{" "}
                  {new Date(pkgSnapshot.sentAt).toLocaleTimeString()}
                </p>
              )}

              <div className="mb-2 grid grid-cols-2 gap-2">
                <Button size="sm" onClick={sendPaymentRequest} disabled={sendingPayment}>
                  {sendingPayment ? "Sending…" : "Send Payment Request"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPackagePicker((v) => !v)}>
                  View Package
                </Button>
                <Button size="sm" variant="outline" onClick={sendPaymentRequest} disabled={sendingPayment || !pkgSnapshot}>
                  Resend Payment Link
                </Button>
                <Button size="sm" variant="outline" onClick={checkPaymentStatus} disabled={checkingStatus}>
                  {checkingStatus ? "Checking…" : "Check Payment Status"}
                </Button>
              </div>

              {showPackagePicker && (
                <div className="mb-3 rounded-lg border border-line p-3 text-sm">
                  <div className="mb-2 flex gap-1">
                    {(["monthly", "yearly"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setPickCycle(c)}
                        className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${
                          pickCycle === c ? "bg-indigo-soft text-indigo" : "border border-line text-ink-soft"
                        }`}
                      >
                        {c === "monthly" ? "Monthly" : "Yearly (save 17%)"}
                      </button>
                    ))}
                  </div>
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <Checkbox checked={pickAddon} onCheckedChange={(v) => setPickAddon(Boolean(v))} />
                    <span className="flex-1">Win Local Search add-on</span>
                    {pickQuote && <span className="font-semibold">+{(pickQuote.addonCents / 100).toFixed(2)}</span>}
                  </label>
                  {pickQuote && (
                    <div className="flex justify-between border-t border-dashed border-line pt-2 font-semibold">
                      <span>Due today</span>
                      <span>
                        ${(pickQuote.dueTodayCents / 100).toFixed(2)}
                        {pickQuote.unitLabel}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {editableFields && request.type === "claim" && (
            <div className="mb-3 rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-bold uppercase text-ink-soft">Profile details</p>
              <p className="mb-2 text-[0.7rem] text-ink-soft">
                Edits save immediately and sync to the visitor&apos;s profile preview.
              </p>
              {(Object.keys(FIELD_LABELS) as (keyof EditableFields)[]).map((key) => (
                <div key={key} className="mb-1.5 flex items-center gap-2">
                  <label className="w-20 flex-shrink-0 text-xs text-ink-soft">{FIELD_LABELS[key]}</label>
                  <input
                    className="flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
                    value={editableFields[key]}
                    onChange={(e) => setEditableFields({ ...editableFields, [key]: e.target.value })}
                  />
                </div>
              ))}
              <Button size="sm" variant="success" onClick={saveFields} disabled={savingFields} className="mt-1 w-full">
                Save changes
              </Button>
            </div>
          )}

          {request.status === "waiting" && (
            <Button onClick={accept} disabled={accepting} className="mb-2 w-full">
              {accepting ? "Accepting…" : "Accept"}
            </Button>
          )}
          {request.status === "active" && (
            <>
              <Button
                onClick={resolve}
                variant="success"
                disabled={request.type === "upgrade" && request.conversion_status !== "payment_succeeded"}
                className="mb-1 w-full"
              >
                Mark resolved
              </Button>
              {request.type === "upgrade" && request.conversion_status !== "payment_succeeded" && (
                <p className="mb-2 text-center text-[0.7rem] text-amber">
                  Locked until payment succeeds — currently: {request.conversion_status ?? "discussing"}
                </p>
              )}
            </>
          )}

          <p className="mb-1 mt-3 text-xs font-bold uppercase text-ink-soft">Checklist</p>
          <ul className="mb-3">
            {requirements.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1 text-sm">
                <Checkbox checked={r.done} onCheckedChange={(v) => toggleRequirement(r.id, Boolean(v))} />
                <span className={r.done ? "text-mint line-through" : ""}>{r.label}</span>
              </li>
            ))}
          </ul>

          <p className="mb-1 text-xs font-bold uppercase text-ink-soft">Internal notes (never shown to visitor)</p>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} className="mb-2 min-h-[56px]" />
          <Button size="sm" variant="outline" onClick={saveNote} className="mb-3 w-full">
            Save note
          </Button>
          <div className="text-xs text-ink-soft">
            {notes.map((n) => (
              <p key={n.id} className="border-t border-dashed border-line py-1">
                {n.note}
              </p>
            ))}
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col rounded-lg border border-line">
          <p className="border-b border-line px-3 py-2 text-xs font-bold uppercase text-ink-soft">
            {loading ? "Loading…" : "Conversation"}
          </p>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={m.id} className={i < aiCutoff ? "opacity-70" : ""}>
                <p className="mb-0.5 text-[10px] font-bold uppercase text-ink-soft">
                  {m.sender} {i === aiCutoff && aiCutoff > 0 && "— live from here"}
                </p>
                <div className="rounded-md bg-paper px-2.5 py-1.5 text-sm">{m.body}</div>
              </div>
            ))}
            {!request.session_id && <p className="text-sm text-ink-soft">No linked conversation for this request.</p>}
          </div>
          {request.session_id && request.status === "active" && (
            <form
              className="flex gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
            >
              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Reply…" />
              <Button type="submit">Send</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
