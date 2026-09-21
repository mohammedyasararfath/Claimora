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

export function RequestDetailPanel({ request }: { request: LiveRequest }) {
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [noteText, setNoteText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/live-queue/${request.id}`)
      .then((r) => r.json())
      .then((json) => {
        setRequirements(json.requirements ?? []);
        setNotes(json.notes ?? []);
        setInitialMessages(json.messages ?? []);
      })
      .finally(() => setLoading(false));
  }, [request.id]);

  const messages = useChatSessionMessages(request.session_id, initialMessages);

  async function accept() {
    const res = await fetch(`/api/live-queue/${request.id}/accept`, { method: "POST" });
    if (!res.ok) toast((await res.json()).error ?? "could not accept", "error");
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

          {request.status === "waiting" && (
            <Button onClick={accept} className="mb-2 w-full">
              Accept
            </Button>
          )}
          {request.status === "active" && (
            <Button onClick={resolve} variant="success" className="mb-2 w-full">
              Mark resolved
            </Button>
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
