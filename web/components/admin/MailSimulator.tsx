"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type EmailEvent = { profile_id: string; sequence_num: number; status: string; sent_at: string | null };
type Inbox = { profileId: string; name: string; email: string; suppressed: string | null; emails: EmailEvent[] };

// Mirrors SUBJECTS in supabase/functions/email-sequence-tick/index.ts —
// duplicated for the same reason UPGRADE_REQUIREMENTS is duplicated in
// dashboard-copilot: that function isn't reachable from this app.
const SUBJECTS = [
  "Your profile is ready to claim",
  "Reminder: your profile is still waiting to be claimed",
  "Final reminder: claim your profile",
];

function subjectFor(seq: number): string {
  return SUBJECTS[Math.min(seq - 1, SUBJECTS.length - 1)] ?? "Your profile is ready to claim";
}

export function MailSimulator() {
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailEvent | null>(null);
  const [generatingClaim, setGeneratingClaim] = useState(false);

  useEffect(() => {
    fetch("/api/admin/mail")
      .then((r) => r.json())
      .then((json) => {
        const list = (json.inboxes ?? []) as Inbox[];
        setInboxes(list);
        if (list[0]) setSelectedProfileId(list[0].profileId);
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = inboxes.find((i) => i.profileId === selectedProfileId) ?? null;

  async function claimNow() {
    if (!selected) return;
    setGeneratingClaim(true);
    try {
      const res = await fetch(`/api/admin/profiles/${selected.profileId}/claim-link`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not generate link");
      window.open(json.url, "_blank");
    } finally {
      setGeneratingClaim(false);
    }
  }

  if (loading) return <p className="text-sm text-ink-soft">Loading…</p>;

  if (inboxes.length === 0) {
    return <p className="text-sm text-ink-soft">No unclaimed profiles with claim-email history right now.</p>;
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-amber bg-amber-soft p-3 text-sm text-amber">
        Simulated inbox — real claim-reminder emails and their real Claim/Unsubscribe/Report-spam links, read
        straight from the database. Not shown to visitors.
      </div>

      <div className="mb-4">
        <select
          value={selectedProfileId ?? ""}
          onChange={(e) => {
            setSelectedProfileId(e.target.value);
            setSelectedEmail(null);
          }}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold"
        >
          {inboxes.map((i) => (
            <option key={i.profileId} value={i.profileId}>
              {i.name}&apos;s inbox
            </option>
          ))}
        </select>
      </div>

      {selected && !selectedEmail && (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="border-b border-line bg-paper p-3">
            <p className="font-serif text-lg font-semibold">{selected.name}&apos;s inbox</p>
            <p className="text-xs text-ink-soft">{selected.email}</p>
          </div>
          {selected.emails.length === 0 && (
            <p className="p-4 text-sm text-ink-soft">No claim emails sent to this address yet.</p>
          )}
          {selected.emails.map((e) => (
            <button
              key={e.sequence_num}
              onClick={() => setSelectedEmail(e)}
              className="flex w-full items-center justify-between border-b border-line p-3 text-left last:border-b-0 hover:bg-paper"
            >
              <span>
                <span className="block text-sm font-semibold">Experience.com</span>
                <span className="block text-sm text-ink-soft">{subjectFor(e.sequence_num)}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-ink-soft">
                {e.sent_at ? new Date(e.sent_at).toLocaleDateString() : "not sent yet"}
              </span>
            </button>
          ))}
          {selected.suppressed && (
            <p className="border-t border-line bg-coral-soft p-3 text-xs font-semibold text-coral">
              This address {selected.suppressed === "spam" ? "reported a message as spam" : "unsubscribed"} — no
              further claim emails will be sent.
            </p>
          )}
        </div>
      )}

      {selected && selectedEmail && (
        <div className="rounded-lg border border-line">
          <button onClick={() => setSelectedEmail(null)} className="p-3 text-sm font-semibold text-indigo">
            ← Back to inbox
          </button>
          <div className="border-t border-line p-4">
            <p className="mb-1 text-xs text-ink-soft">
              From: Experience.com &lt;noreply@experience.com&gt;
              <br />
              To: {selected.email}
            </p>
            <p className="mb-4 text-lg font-semibold">{subjectFor(selectedEmail.sequence_num)}</p>
            <p className="mb-1">Hi {selected.name.split(" ")[0]},</p>
            <p className="mb-4">
              {subjectFor(selectedEmail.sequence_num)}. Claiming takes about a minute and lets you verify your
              details, reply to reviews, and manage how you show up in search.
            </p>
            <Button onClick={claimNow} disabled={generatingClaim} className="mb-4">
              {generatingClaim ? "Generating…" : "Claim Your Profile →"}
            </Button>
            <p className="border-t border-dashed border-line pt-3 text-xs text-ink-soft">
              Didn&apos;t request this?{" "}
              <a
                href={`/api/email/unsubscribe?email=${encodeURIComponent(selected.email)}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo underline"
              >
                Unsubscribe
              </a>{" "}
              or{" "}
              <a
                href={`/api/email/spam?email=${encodeURIComponent(selected.email)}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo underline"
              >
                report as spam
              </a>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
