"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

export function CreateCtaClient({ freeformText }: { freeformText: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function start() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeformText: freeformText || "I'd like to build a new profile." }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not start");
      router.push(`/agent/${json.sessionId}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button variant="ai" onClick={start} disabled={submitting}>
      {submitting ? "Starting…" : "Build my profile with AI"}
    </Button>
  );
}
