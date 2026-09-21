"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

export function ContactSupportButton({
  profileId,
  currentTier,
  currentSrs,
}: {
  profileId: string;
  currentTier: string;
  currentSrs: number;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function request() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/live-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: currentTier === "pro" ? "contact" : "upgrade",
          profileId,
          reason: "dashboard request",
          summary: `Owner asked for help from their dashboard. Current tier: ${currentTier}, SRS: ${currentSrs}.`,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not reach support");
      setSent(true);
      toast("A team member will be with you shortly.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button variant="outline" onClick={request} disabled={submitting || sent} className="w-full">
      {sent ? "We'll be in touch" : "Talk to a person"}
    </Button>
  );
}
