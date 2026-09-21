"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import type { Database } from "@/lib/types/database.types";

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "slug" | "name" | "category" | "brokerage" | "city" | "status" | "rating" | "reviews_count" | "srs" | "top5" | "snippet"
>;

export function ResultCard({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [showWhy, setShowWhy] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function claimNow() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, claimSource: "search_results" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not start claim");
      router.push(`/claim/${profile.id}/verify?session=${json.sessionId}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-3">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4 sm:flex-row">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-indigo-soft font-serif text-xl font-bold text-indigo">
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-semibold text-ink">{profile.name}</span>
            {profile.status !== "unclaimed" && <span className="text-mint">✓</span>}
            {profile.status === "pro" && <Badge variant="pro">PRO</Badge>}
            {profile.top5 && <Badge variant="top5">Top 5</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            {profile.category}
            {profile.brokerage ? ` · ${profile.brokerage}` : ""}
            {profile.city ? ` · ${profile.city}` : ""}
          </p>
          {profile.snippet && <p className="mt-2 rounded-md bg-paper p-2 text-sm">{profile.snippet}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            {profile.reviews_count > 0 && (
              <span className="text-coral">
                {"★".repeat(Math.round(profile.rating))} <span className="text-ink-soft">({profile.reviews_count})</span>
              </span>
            )}
            <span className="rounded-md bg-indigo-soft px-2 py-0.5 font-mono text-xs text-indigo">SRS {profile.srs}</span>
          </div>

          {showWhy && profile.status === "unclaimed" && (
            <div className="mt-3 rounded-lg border border-line bg-violet-soft p-3 text-sm">
              Claiming lets you verify your details, reply to reviews, and control what visitors see — it takes
              about two minutes with our AI copilot.
            </div>
          )}

          {showContact && profile.status !== "unclaimed" && <ContactForm profileId={profile.id} onDone={() => setShowContact(false)} />}
        </div>
        <div className="flex min-w-[130px] flex-col justify-center gap-2">
          {profile.status === "unclaimed" ? (
            <>
              <Button onClick={claimNow} disabled={submitting}>
                {submitting ? "Starting…" : "Claim Now"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowWhy((v) => !v)}>
                Why claim this?
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setShowContact((v) => !v)}>
              Contact
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/live-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "contact",
          profileId,
          requesterName: name,
          requesterEmail: email,
          requesterMessage: message,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not send");
      toast("Message sent — they'll get back to you soon.", "success");
      onDone();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-paper p-3">
      <input
        className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
        placeholder="Your email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <textarea
        className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button size="sm" onClick={submit} disabled={submitting || !name || !email || !message}>
        Send
      </Button>
    </div>
  );
}
