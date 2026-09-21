// POST /functions/v1/stripe-webhook
//
// This is the ONLY place in the entire codebase that sets profiles.status =
// 'pro'. Neither the packages/payment UI nor the in-chat payment-request card
// ever flips that column directly — both only ever create a Stripe Checkout
// Session / PaymentIntent and wait for this webhook to confirm it, closing
// the gap the prototype has (its payment form flips `tier='pro'` synchronously
// on submit with no server confirmation at all).

import Stripe from "npm:stripe@17";
import { jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireEnv } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-02-24.acacia" });
    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const signature = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    if (!signature) return jsonResponse({ error: "missing stripe-signature header" }, 400);

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("stripe signature verification failed", err);
      return jsonResponse({ error: "invalid signature" }, 400);
    }

    const supabase = supabaseAdmin();

    // Idempotency: never process the same Stripe event twice.
    const { data: already } = await supabase
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();
    if (already) return jsonResponse({ ok: true, duplicate: true });

    await supabase.from("stripe_webhook_events").insert({ id: event.id, type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string | null;
        const profileId = session.metadata?.profile_id;
        const ownerUserId = session.metadata?.owner_user_id;
        const packageCode = session.metadata?.package_code ?? "core_pro";
        const cycle = (session.metadata?.cycle as "monthly" | "yearly") ?? "yearly";
        const promoCode = session.metadata?.promo_code || null;

        if (!profileId || !ownerUserId || !subscriptionId) break;

        const { data: pkg } = await supabase.from("packages").select("id").eq("code", packageCode).single();

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

        const { data: sub, error: upsertError } = await supabase
          .from("subscriptions")
          .upsert(
            {
              profile_id: profileId,
              owner_user_id: ownerUserId,
              package_id: pkg?.id,
              cycle,
              promo_code: promoCode,
              status: stripeSub.status === "trialing" ? "trialing" : "active",
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId,
              current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
              trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
            },
            { onConflict: "stripe_subscription_id" },
          )
          .select("id")
          .single();

        if (upsertError) throw upsertError;

        await supabase
          .from("profiles")
          .update({
            status: "pro",
            srs: Math.min(850, 500), // baseline bump; nightly recompute owns steady-state scoring
            sub_start_date: new Date().toISOString(),
            trial_end_date: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
          })
          .eq("id", profileId);

        if (session.payment_intent) {
          await supabase.from("payments").insert({
            subscription_id: sub?.id,
            stripe_payment_intent_id: session.payment_intent as string,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            status: "succeeded",
          });
        }

        // If this checkout was created from an in-chat payment-request card,
        // its live_agent_requests row carries the session id in metadata —
        // mark the conversion so resolveLiveRequest's server-side gate opens.
        if (session.metadata?.live_request_id) {
          await supabase
            .from("live_agent_requests")
            .update({ conversion_status: "payment_succeeded" })
            .eq("id", session.metadata.live_request_id);
        }

        await supabase.from("agent_events").insert({
          surface: "Upgrade assistant",
          outcome: "converted",
          detail: "checkout.session.completed",
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, owner_user_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (sub) {
          await supabase.from("payments").insert({
            subscription_id: sub.id,
            stripe_payment_intent_id: (invoice.payment_intent as string) ?? `invoice_${invoice.id}`,
            amount_cents: invoice.amount_due,
            currency: invoice.currency,
            status: "failed",
            failure_reason: invoice.last_finalization_error?.message ?? "payment failed",
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase
          .from("subscriptions")
          .update({
            status: sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled",
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: row } = await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id)
          .select("profile_id")
          .maybeSingle();

        if (row?.profile_id) {
          await supabase.from("profiles").update({ status: "claimed" }).eq("id", row.profile_id);
        }
        break;
      }

      default:
        break; // unhandled event types are acknowledged but ignored
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("stripe-webhook error", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
