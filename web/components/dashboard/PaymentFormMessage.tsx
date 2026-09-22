"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { formatCents } from "@/lib/utils";
import type { PaymentFormPayload } from "@/lib/payments/paymentFormMarker";

interface Quote {
  packageName: string;
  coreCents: number;
  addonCents: number;
  dueTodayCents: number;
  unitLabel: string;
}

// Renders in place of a plain chat bubble whenever a message body decodes as
// a payment-form marker (see paymentFormMarker.ts) — the AI copilot's
// show_payment_form tool and the live agent's "Send Payment Request" both
// produce one instead of a link, so the visitor pays right here without
// leaving the conversation. Card fields are cosmetic: this app has no live
// Stripe Elements integration wired into the chat, and in DEMO_MODE (the
// only mode this ships with configured) payment always completes via
// /api/billing/demo-upgrade — see PackageBuilder.tsx for the same
// demoMode branch on the self-service /dashboard/upgrade page.
export function PaymentFormMessage({ profileId, payload }: { profileId: string; payload: PaymentFormPayload }) {
  const { toast } = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ cycle: payload.cycle, addon: String(payload.addon) });
    fetch(`/api/packages/quote?${params}`)
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => toast("Could not load pricing", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.cycle, payload.addon]);

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function payNow() {
    setPaying(true);
    try {
      if (demoMode) {
        const res = await fetch("/api/billing/demo-upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId,
            cycle: payload.cycle,
            addon: payload.addon,
            liveRequestId: payload.liveRequestId,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "could not complete payment");
        setPaid(true);
        window.location.reload();
        return;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          cycle: payload.cycle,
          addon: payload.addon,
          liveRequestId: payload.liveRequestId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not start checkout");
      window.location.href = json.url;
    } catch (err) {
      toast((err as Error).message, "error");
      setPaying(false);
    }
  }

  return (
    <div className="max-w-[92%] rounded-lg border border-line bg-card p-3.5 text-sm">
      <p className="mb-2 text-xs font-bold uppercase text-ink-soft">Payment</p>
      {quote ? (
        <>
          <div className="mb-3 flex justify-between rounded-md bg-paper px-2.5 py-2">
            <span>
              {quote.packageName} ({payload.cycle}
              {payload.addon ? " + Win Local Search" : ""})
            </span>
            <span className="font-bold">
              {formatCents(quote.dueTodayCents)}
              {quote.unitLabel}
            </span>
          </div>
          <div className="mb-2 grid grid-cols-1 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name on card"
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
              disabled={paying || paid}
            />
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="Card number"
              inputMode="numeric"
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
              disabled={paying || paid}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="MM/YY"
                className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
                disabled={paying || paid}
              />
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                placeholder="CVV"
                inputMode="numeric"
                className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
                disabled={paying || paid}
              />
            </div>
          </div>
          <button
            onClick={payNow}
            disabled={paying || paid}
            className="w-full rounded-md bg-mint px-3 py-2 text-sm font-bold text-[#06331E] disabled:opacity-60"
          >
            {paid ? "Payment received — refreshing…" : paying ? "Processing…" : `Pay ${formatCents(quote.dueTodayCents)} Now`}
          </button>
          <p className="mt-1.5 text-center text-[0.65rem] text-ink-soft">Demo checkout — no real card is charged.</p>
        </>
      ) : (
        <p className="text-ink-soft">Loading pricing…</p>
      )}
    </div>
  );
}
