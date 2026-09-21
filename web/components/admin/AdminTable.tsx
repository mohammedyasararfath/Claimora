"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { EmailJourneyRow } from "./EmailJourneyRow";
import type { Database } from "@/lib/types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Filter = "all" | "unclaimed" | "claimed" | "pro";

export function AdminTable() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ unclaimed: 0, claimed: 0, pro: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
    fetch(`/api/admin/profiles?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setProfiles(json.profiles ?? []);
        setTotal(json.total ?? 0);
        if (json.summary) setSummary(json.summary);
      })
      .finally(() => setLoading(false));
  }, [filter, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showEmailColumns = filter === "all" || filter === "unclaimed";
  const showClaimedColumns = filter === "all" || filter === "claimed" || filter === "pro";

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(["unclaimed", "claimed", "pro"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(filter === f ? "all" : f);
              setPage(1);
            }}
            className={cn(
              "rounded-lg border border-line p-3 text-center transition-colors",
              filter === f && "border-indigo bg-indigo-soft",
            )}
          >
            <p className="font-serif text-2xl font-bold">{summary[f]}</p>
            <p className="text-xs capitalize text-ink-soft">{f}</p>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase text-ink-soft">
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Status</th>
              {showEmailColumns && <th className="p-3">Claim Emails</th>}
              {showClaimedColumns && <th className="p-3">Claim Date</th>}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <React.Fragment key={p.id}>
                <tr className="border-b border-line hover:bg-paper">
                  <td className="p-3">
                    {p.status === "unclaimed" ? (
                      <button
                        className="font-semibold text-indigo"
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      >
                        {p.name} {expanded === p.id ? "▲" : "▼"}
                      </button>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3 capitalize">{p.status}</td>
                  {showEmailColumns && <td className="p-3 text-ink-soft">{p.status === "unclaimed" ? "see journey" : "—"}</td>}
                  {showClaimedColumns && (
                    <td className="p-3 text-ink-soft">{p.claim_date ? new Date(p.claim_date).toLocaleDateString() : "—"}</td>
                  )}
                </tr>
                {expanded === p.id && (
                  <tr>
                    <td colSpan={5} className="bg-paper p-0">
                      <EmailJourneyRow profileId={p.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!loading && profiles.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-soft">
                  No profiles match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          className="rounded-md border border-line bg-card px-2 py-1 text-sm"
        >
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-md border border-line px-2.5 py-1 text-sm disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-sm text-ink-soft">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-line px-2.5 py-1 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
