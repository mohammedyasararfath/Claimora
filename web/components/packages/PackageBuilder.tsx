"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";
import { formatCents } from "@/lib/utils";

interface Quote {
  coreCents: number;
  addonCents: number;
  addonApplied: boolean;
  subtotalCents: number;
  promoCode: string | null;
  trialChargeCents: number | null;
  dueTodayCents: number;
  unitLabel: string;
}

export function PackageBuilder({ profileId }: { profileId: string }) {
  const { toast } = useToast();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [addon, setAddon] = useState(false);
  const [promoChecked, setPromoChecked] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ cycle, addon: String(addon) });
    if (promoChecked && promoCode) params.set("promoCode", promoCode);
    fetch(`/api/packages/quote?${params}`)
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => toast("Could not load pricing", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, addon, promoChecked, promoCode]);

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function launch() {
    setLaunching(true);
    try {
      if (demoMode) {
        // Demo-only shortcut — bypasses Stripe entirely, see
        // app/api/billing/demo-upgrade/route.ts. Never active unless
        // DEMO_MODE=true is explicitly set; the real Stripe path below is
        // what production always uses.
        const res = await fetch("/api/billing/demo-upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, cycle, addon }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "could not complete demo upgrade");
        window.location.href = "/dashboard/upgrade/confirmation?demo=true";
        return;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          cycle,
          addon,
          promoCode: promoChecked && promoCode ? promoCode : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not start checkout");
      window.location.href = json.url;
    } catch (err) {
      toast((err as Error).message, "error");
      setLaunching(false);
    }
  }

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-line lg:grid-cols-[1fr_320px]">
      <div className="border-b border-line p-6 lg:border-b-0 lg:border-r">
        <div className="mb-4 flex justify-center gap-2">
          <div className="inline-flex overflow-hidden rounded-full border border-line">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-4 py-2 text-sm font-semibold ${cycle === c ? "bg-indigo-soft text-indigo" : "text-ink-soft"}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly (save 17%)"}
              </button>
            ))}
          </div>
        </div>

        <Card className="mb-4">
          <div className="mb-2 flex items-start justify-between">
            <span className="flex items-center gap-2 text-base font-bold">
              <span className="rounded bg-amber px-1.5 py-0.5 text-xs text-[#3a2600]">CORE</span> Pro
            </span>
            {quote && <span className="text-base font-bold">{formatCents(quote.coreCents)}{quote.unitLabel}</span>}
          </div>
          <p className="mb-3 text-sm text-ink-soft">
            Everything in claimed, plus Web Analytics, Listings management, and priority placement guidance.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Web Analytics", "Listings", "Priority placement", "Faster SRS refresh"].map((f) => (
              <div key={f} className="flex items-center gap-1.5">
                <span className="text-indigo">✓</span> {f}
              </div>
            ))}
          </div>
        </Card>

        <label className="mb-2 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3.5">
          <Checkbox checked={addon} onCheckedChange={(v) => setAddon(Boolean(v))} className="mt-0.5" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">Win Local Search</span>
            <span className="block text-sm text-ink-soft">Boost visibility for local search queries.</span>
          </span>
          {quote && <span className="whitespace-nowrap text-sm font-semibold">+{formatCents(quote.addonCents)}</span>}
        </label>

        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 text-sm">
          <Checkbox checked={promoChecked} onCheckedChange={(v) => setPromoChecked(Boolean(v))} className="mt-0.5" />
          Have a promo code?
        </label>
        {promoChecked && (
          <Input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Promo code"
            className="mt-2"
          />
        )}
      </div>

      <div className="p-6">
        <div className="mb-4 rounded-md bg-paper py-2 text-center text-sm font-semibold">Order Summary</div>
        {quote && (
          <>
            <div className="flex justify-between py-1.5 text-sm">
              <span>Pro ({cycle})</span>
              <span>{formatCents(quote.coreCents)}</span>
            </div>
            {quote.addonApplied && (
              <div className="flex justify-between py-1.5 text-sm">
                <span>Win Local Search</span>
                <span>{formatCents(quote.addonCents)}</span>
              </div>
            )}
            {quote.promoCode && (
              <div className="mb-2 flex justify-between rounded-md bg-mint-soft px-2 py-2 text-sm font-semibold text-mint">
                <span>Trial applied</span>
                <span>{quote.promoCode}</span>
              </div>
            )}
            <hr className="my-2 border-line" />
            <div className="flex justify-between text-base font-bold text-mint">
              <span>Due today</span>
              <span>{formatCents(quote.dueTodayCents)}</span>
            </div>
            <Button onClick={launch} disabled={launching} className="mt-4 w-full">
              {launching ? "Starting checkout…" : "Launch Your Bundle Now"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
