import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { requireServerEnv } from "@/lib/supabase/env";

// The confirmation page polls this instead of trusting the Checkout redirect
// itself as proof of payment — it reflects whatever supabase/functions/
// stripe-webhook has actually written to `subscriptions`, which is the only
// source of truth for whether Pro is active.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const stripe = new Stripe(requireServerEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-02-24.acacia" });
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  if (!checkoutSession.subscription) {
    return NextResponse.json({ status: "pending" });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, trial_end")
    .eq("stripe_subscription_id", checkoutSession.subscription as string)
    .maybeSingle();

  if (!subscription) {
    // Webhook hasn't landed yet — normal for the first second or two after redirect.
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json(subscription);
}
