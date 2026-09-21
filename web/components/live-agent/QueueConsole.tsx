"use client";

import { useState } from "react";
import { useLiveQueue } from "@/hooks/useLiveQueue";
import { RequestDetailPanel } from "./RequestDetailPanel";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database.types";

type LiveRequest = Database["public"]["Tables"]["live_agent_requests"]["Row"];

export function QueueConsole({ initialRequests }: { initialRequests: LiveRequest[] }) {
  const requests = useLiveQueue(initialRequests);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequests[0]?.id ?? null);
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <div className="rounded-lg border border-line bg-card p-3.5">
        <h3 className="mb-2 text-sm font-semibold text-ink-soft">Queue ({requests.length})</h3>
        {requests.length === 0 && <p className="text-sm italic text-ink-soft">No one&apos;s waiting right now.</p>}
        {requests.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={cn(
              "mb-2 w-full rounded-lg border border-line p-2.5 text-left text-sm hover:border-indigo",
              selectedId === r.id && "border-indigo bg-indigo-soft",
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold capitalize">{r.type}</span>
              <StatusPill status={r.status} />
            </div>
            <p className="truncate text-xs text-ink-soft">{r.summary ?? r.reason ?? "No summary"}</p>
          </button>
        ))}
      </div>

      {selected ? (
        <RequestDetailPanel request={selected} />
      ) : (
        <div className="rounded-lg border border-line bg-card p-6 text-center text-sm text-ink-soft">
          Select a request from the queue.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    waiting: "bg-amber-soft text-amber",
    active: "bg-indigo-soft text-indigo",
    resolved: "bg-mint-soft text-mint",
    abandoned: "bg-slate-soft text-slate",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", styles[status])}>{status}</span>;
}
