"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

export function ClaimLandingCta({ profileId, token }: { profileId: string; token?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function claimNow() {
    setSubmitting(true);
    try {
      const payload = token
        ? { profileId, claimSource: "claim_email_link" as const, claimToken: token }
        : { profileId, claimSource: "search_results" as const };

      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not start claim");

      // A claim-email-link click is itself treated as verified email
      // ownership, so it skips the /verify screen entirely and goes straight
      // to the AI copilot — matching the approved flow.
      router.push(`/agent/${json.sessionId}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button size="lg" onClick={claimNow} disabled={submitting}>
      {submitting ? "Starting…" : "Claim Now"}
    </Button>
  );
}
