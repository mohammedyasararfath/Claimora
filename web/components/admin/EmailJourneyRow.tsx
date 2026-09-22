"use client";

import { useEffect, useState } from "react";

interface EmailEvent {
  id: string;
  sequence_num: number;
  status: string;
  sent_at: string | null;
}

interface Enrollment {
  emails_sent: number;
  next_scheduled_at: string | null;
  stopped_reason: string | null;
  campaigns: { name: string; interval_days: number; sequence_length: number } | null;
}

const STATUS_COLOR: Record<string, string> = {
  queued: "text-ink-soft",
  received: "text-indigo",
  opened: "text-violet",
  clicked: "text-mint",
  bounced: "text-coral",
  spam: "text-coral",
  unsubscribed: "text-slate",
};

export function EmailJourneyRow({ profileId }: { profileId: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/profiles/${profileId}/email-journey`)
      .then((r) => r.json())
      .then((json) => {
        setEnrollment(json.enrollment);
        setEvents(json.events ?? []);
      })
      .finally(() => setLoading(false));
  }, [profileId]);

  if (loading) return <div className="p-4 text-sm text-ink-soft">Loading…</div>;

  return (
    <div className="p-4 pl-11 text-sm">
      {!enrollment && <p className="mb-3 text-ink-soft">Not enrolled in any campaign yet.</p>}
      {enrollment &&
        events.map((e) => (
          <div key={e.id} className="border-t border-dashed border-line py-1.5 first:border-t-0">
            Email {e.sequence_num} — sent {e.sent_at ? new Date(e.sent_at).toLocaleDateString() : "not yet"} —{" "}
            <span className={STATUS_COLOR[e.status] ?? ""}>{e.status}</span>
          </div>
        ))}
      {enrollment && (
        <p className="mt-2 text-xs text-ink-soft">
          {enrollment.stopped_reason === "claimed" && "Sequence stopped — profile was claimed."}
          {enrollment.stopped_reason === "unsubscribed" && "Sequence stopped — recipient unsubscribed."}
          {enrollment.stopped_reason === "spam" && "Sequence stopped — recipient reported this as spam."}
          {enrollment.stopped_reason === "sequence_complete" && "Sequence complete — no more emails scheduled."}
          {!enrollment.stopped_reason &&
            enrollment.next_scheduled_at &&
            `Next email scheduled for ${new Date(enrollment.next_scheduled_at).toLocaleDateString()}.`}
        </p>
      )}
    </div>
  );
}
