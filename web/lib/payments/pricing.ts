import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface PriceQuote {
  cycle: "monthly" | "yearly";
  packageCode: string;
  packageName: string;
  coreCents: number;
  addonApplied: boolean;
  addonCents: number;
  subtotalCents: number;
  promoCode: string | null;
  trialChargeCents: number | null;
  dueTodayCents: number;
  unitLabel: "/year" | "/month";
}

// The single server-side source of truth for pricing — the client only ever
// displays what this function returns via GET /api/packages/quote, it never
// sends a trusted total. Reads live packages/addons/promo_codes rows instead
// of the prototype's hardcoded pkgPrices() so prices can change via the
// database (or eventually an admin UI) without a redeploy.
export async function quotePrice(params: {
  cycle: "monthly" | "yearly";
  addon: boolean;
  promoCode?: string;
}): Promise<PriceQuote> {
  const supabase = await createClient();

  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select("*")
    .eq("code", "core_pro")
    .single();

  if (pkgError || !pkg) {
    throw new Error("core package is not configured — seed the `packages` table first");
  }

  const coreCents = params.cycle === "yearly" ? pkg.yearly_price_cents : pkg.monthly_price_cents;

  let addonCents = 0;
  if (params.addon) {
    const { data: addon } = await supabase.from("addons").select("*").eq("code", "win_local_search").single();
    if (addon) {
      addonCents = params.cycle === "yearly" ? addon.yearly_price_cents : addon.monthly_price_cents;
    }
  }

  const subtotalCents = coreCents + addonCents;

  let trialChargeCents: number | null = null;
  let validatedPromoCode: string | null = null;

  if (params.promoCode) {
    const { data: promo } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", params.promoCode)
      .eq("active", true)
      .maybeSingle();

    const notExpired = !promo?.expires_at || new Date(promo.expires_at) > new Date();
    if (promo && notExpired) {
      validatedPromoCode = promo.code;
      trialChargeCents = promo.trial_charge_cents;
    }
  }

  return {
    cycle: params.cycle,
    packageCode: pkg.code,
    packageName: pkg.name,
    coreCents,
    addonApplied: params.addon,
    addonCents,
    subtotalCents,
    promoCode: validatedPromoCode,
    trialChargeCents,
    dueTodayCents: trialChargeCents ?? subtotalCents,
    unitLabel: params.cycle === "yearly" ? "/year" : "/month",
  };
}
