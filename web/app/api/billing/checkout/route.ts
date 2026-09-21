import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { requireServerEnv } from "@/lib/supabase/env";
import { billingCheckoutSchema } from "@/lib/validation/schemas";
import { quotePrice } from "@/lib/payments/pricing";

// Creates a real Stripe Checkout Session (hosted, PCI scope stays entirely
// with Stripe) for the Pro subscription. This route NEVER sets
// profiles.status = 'pro' itself — only supabase/functions/stripe-webhook
// does that, once Stripe confirms the payment. See IMPLEMENTATION_STATUS.md
// for the Stripe Price/Product setup this expects (packages/addons rows'
// stripe_monthly_price_id / stripe_yearly_price_id columns).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = billingCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, owner_user_id, email")
    .eq("id", parsed.data.profileId)
    .single();

  if (!profile || profile.owner_user_id !== user.id) {
    return NextResponse.json({ error: "not authorized for this profile" }, { status: 403 });
  }

  const quote = await quotePrice({ cycle: parsed.data.cycle, addon: parsed.data.addon, promoCode: parsed.data.promoCode });

  const { data: pkg } = await supabase.from("packages").select("*").eq("code", "core_pro").single();
  if (!pkg?.stripe_monthly_price_id || !pkg?.stripe_yearly_price_id) {
    return NextResponse.json(
      { error: "Stripe prices are not configured yet — set packages.stripe_monthly_price_id / stripe_yearly_price_id" },
      { status: 503 },
    );
  }

  const priceId = parsed.data.cycle === "yearly" ? pkg.stripe_yearly_price_id : pkg.stripe_monthly_price_id;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];

  if (parsed.data.addon) {
    const { data: addon } = await supabase.from("addons").select("*").eq("code", "win_local_search").single();
    const addonPriceId = parsed.data.cycle === "yearly" ? addon?.stripe_yearly_price_id : addon?.stripe_monthly_price_id;
    if (addonPriceId) lineItems.push({ price: addonPriceId, quantity: 1 });
  }

  const stripe = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-02-24.acacia" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    customer_email: user.email ?? profile.email ?? undefined,
    subscription_data: quote.trialChargeCents
      ? { trial_period_days: 30 } // trial handled as a Stripe trial; the $9.95 due-today charge should be
      : undefined, // configured as a Stripe "trial with setup fee" price or a separate one-time line item —
    // see IMPLEMENTATION_STATUS.md for the exact promo/trial billing model to finalize with Stripe.
    success_url: `${requireServerEnv("APP_URL")}/dashboard/upgrade/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${requireServerEnv("APP_URL")}/dashboard/upgrade`,
    metadata: {
      profile_id: profile.id,
      owner_user_id: user.id,
      package_code: "core_pro",
      cycle: parsed.data.cycle,
      promo_code: quote.promoCode ?? "",
      live_request_id: parsed.data.liveRequestId ?? "",
    },
  });

  return NextResponse.json({ url: session.url });
}
