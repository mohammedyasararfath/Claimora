"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Status = "pending" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export function ConfirmationPoller({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (status !== "pending" || attempts > 20) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/billing/status?session_id=${sessionId}`);
      const json = await res.json();
      setStatus(json.status ?? "pending");
      setAttempts((a) => a + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [sessionId, status, attempts]);

  if (status === "pending") {
    return (
      <>
        <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-full bg-indigo-soft" />
        <h2 className="mb-1 font-serif text-lg font-semibold">Confirming your payment…</h2>
        <p className="text-sm text-ink-soft">This usually takes a few seconds.</p>
      </>
    );
  }

  if (status === "trialing" || status === "active") {
    return (
      <>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft text-2xl text-mint">
          ✓
        </div>
        <h2 className="mb-2 font-serif text-xl font-semibold">You&apos;re PRO</h2>
        <p className="mb-6 text-sm text-ink-soft">Your subscription is active. Welcome to Pro.</p>
        <Button asChild size="lg">
          <Link href="/dashboard?upgraded=1">Go to my dashboard</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-2 font-serif text-lg font-semibold text-coral">We couldn&apos;t confirm your payment</h2>
      <p className="mb-6 text-sm text-ink-soft">Status: {status}. If you were charged, contact support.</p>
      <Button asChild variant="outline">
        <Link href="/dashboard/upgrade">Try again</Link>
      </Button>
    </>
  );
}
