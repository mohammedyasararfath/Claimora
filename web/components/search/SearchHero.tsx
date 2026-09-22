"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";

// These deliberately match real profile name/city text — this box does a
// literal name/city/category search (see lib/search/query.ts), not natural
// language matching. Natural-language queries belong on the "Tell the
// Copilot instead" tab, which routes to the AI create-profile flow.
const TRY_CHIPS = ["Jordan Reyes, Austin TX", "Morgan Chen, Denver", "Dr. Amara Osei, dermatology"];

export function SearchHero() {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [freeform, setFreeform] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function runSearch(q: string) {
    if (q.trim().length < 2) {
      toast("Enter at least 2 characters", "error");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  async function startCreateFlow() {
    if (freeform.trim().length < 5) {
      toast("Tell us a bit more so we can help", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeformText: freeform.trim() }),
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
    <div
      className="px-6 pb-16 pt-14 text-center text-white"
      style={{
        background:
          "radial-gradient(1100px 500px at 15% -10%, #4C1D95, transparent), linear-gradient(160deg, #0B0F19, #211C4D 60%, #4C1D95 130%)",
      }}
    >
      <p className="mb-3 text-xs tracking-wide text-[#C7BEFF]">FIND · CLAIM · GROW</p>
      <h1 className="mx-auto mb-4 max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
        Find yourself. Claim it. Own it.
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-[#C9C6E8]">
        Search by name, claim what&apos;s already yours, or build a brand-new profile in minutes with an AI copilot.
      </p>

      <div className="mx-auto max-w-2xl rounded-2xl border border-white/20 bg-white/5 p-2 backdrop-blur">
        <Tabs defaultValue="search">
          <TabsList>
            <TabsTrigger value="search">Search by name</TabsTrigger>
            <TabsTrigger value="freeform">Tell the Copilot instead</TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <form
              className="flex gap-2 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, city, or business"
                className="bg-white text-ink"
              />
              <Button type="submit">Search</Button>
            </form>
          </TabsContent>
          <TabsContent value="freeform">
            <div className="flex flex-col gap-2 p-1">
              <Textarea
                value={freeform}
                onChange={(e) => setFreeform(e.target.value)}
                placeholder="Describe who you are and what you do — the Copilot will build your profile with you."
                className="min-h-[72px] bg-white text-ink"
              />
              <Button variant="ai" onClick={startCreateFlow} disabled={submitting} className="self-start">
                {submitting ? "Starting…" : "Build my profile with AI"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2 text-sm text-[#B9B6DE]">
        {TRY_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => {
              setQuery(chip);
              runSearch(chip);
            }}
            className="rounded-full border border-white/25 bg-white/5 px-3 py-1 hover:bg-white/15"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
