"use client";

import { useEffect, useState } from "react";

type Outcome = "started" | "converted" | "handed_off" | "resolved_by_human" | "abandoned";
type Totals = Record<Outcome, number>;
type SurfaceRow = Totals & { surface: string; stillOpen: number };
type EventRow = { surface: string; outcome: Outcome; detail: string | null; created_at: string };

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  started: "started",
  converted: "converted",
  handed_off: "handed off",
  resolved_by_human: "resolved",
  abandoned: "abandoned",
};

export function ConversionMeasurement() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/conversion-measurement")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "could not load");
        setTotals(json.totals);
        setSurfaces(json.surfaces ?? []);
        setEvents(json.events ?? []);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-ink-soft">Loading…</p>;
  if (error) return <p className="text-sm text-coral">{error}</p>;
  if (!totals) return null;

  const cards: { label: string; value: number; sub: string; color?: string }[] = [
    { label: "Conversations started", value: totals.started, sub: "" },
    { label: "Converted by the AI", value: totals.converted, sub: pct(totals.converted, totals.started), color: "text-mint" },
    { label: "Handed off to a human", value: totals.handed_off, sub: pct(totals.handed_off, totals.started), color: "text-indigo" },
    {
      label: "Resolved by that human",
      value: totals.resolved_by_human,
      sub: pct(totals.resolved_by_human, totals.handed_off),
    },
    { label: "Quietly lost (abandoned)", value: totals.abandoned, sub: pct(totals.abandoned, totals.started), color: "text-amber" },
  ];

  return (
    <div>
      <div className="mb-5 rounded-lg border border-amber bg-amber-soft p-3 text-sm text-amber">
        Aggregated across every AI Copilot and live-agent conversation — not shown to visitors.
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-card p-4 text-center">
            <p className={`font-serif text-3xl font-bold ${c.color ?? ""}`}>{c.value}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {c.label}
              {c.sub && ` (${c.sub})`}
            </p>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-sm font-bold uppercase text-ink-soft">By surface</h3>
      <div className="mb-6 space-y-3">
        {surfaces.length === 0 && <p className="text-sm text-ink-soft">No events recorded yet.</p>}
        {surfaces.map((s) => {
          const width = s.started > 0 ? ((s.converted + s.resolved_by_human) / s.started) * 100 : 0;
          return (
            <div key={s.surface}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold">{s.surface}</span>
                <span className="text-xs text-ink-soft">
                  {s.converted} AI-converted · {s.resolved_by_human} human-resolved · {s.stillOpen} still open ·{" "}
                  {s.abandoned} lost
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full bg-mint" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mb-2 text-sm font-bold uppercase text-ink-soft">Event log</h3>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-card p-3 font-mono text-xs">
        {events.length === 0 && <p className="text-ink-soft">No events yet.</p>}
        {events.map((e, i) => (
          <p key={i} className="py-0.5 text-ink-soft">
            {new Date(e.created_at).toLocaleTimeString()} — {e.surface} →{" "}
            <span className="font-semibold text-ink">
              {OUTCOME_LABEL[e.outcome]}
              {e.detail ? ` (${e.detail})` : ""}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
