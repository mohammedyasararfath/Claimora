import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

// ============================================================================
// DEMO-ONLY SHORTCUT — never used unless DEMO_MODE=true is explicitly set.
//
// This bypasses Stripe entirely and instantly marks a profile 'pro', for live
// demos where the presenter doesn't have Stripe test-mode credentials set up.
// It does NOT touch, replace, or weaken the real payment path in
// app/api/billing/checkout/route.ts or supabase/functions/stripe-webhook —
// that remains the only production-correct way to activate Pro, and stays
// wired up so it can be switched back to with a single env var flip
// (DEMO_MODE=false) and no code changes.
//
// Guarded server-side by DEMO_MODE (not just a client flag) so this can't be
// invoked just because someone toggles something in the browser.
// ============================================================================

const schema = z.object({
  profileId: z.string().uuid(),
  cycle: z.enum(["monthly", "yearly"]),
  addon: z.boolean().default(false),
  liveRequestId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "demo mode is not enabled" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  // Auth check happens under normal RLS, via the caller's own session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, owner_user_id, srs")
    .eq("id", parsed.data.profileId)
    .single();

  if (!profile || profile.owner_user_id !== user.id) {
    return NextResponse.json({ error: "not authorized for this profile" }, { status: 403 });
  }

  // The actual mutations use the service-role client, same as the real
  // stripe-webhook does — profiles.status/srs and subscriptions/payments
  // inserts are deliberately not writable by a profile_owner under RLS
  // (0010_rls_policies.sql), so this demo path needs the same elevated,
  // server-only privilege the webhook has, not a new RLS hole.
  const admin = createAdminClient();

  const { data: pkg } = await admin.from("packages").select("id").eq("code", "core_pro").single();

  await admin
    .from("profiles")
    .update({
      status: "pro",
      srs: Math.min(850, profile.srs + 350),
      sub_start_date: new Date().toISOString(),
    })
    .eq("id", parsed.data.profileId);

  if (pkg) {
    const { data: sub } = await admin
      .from("subscriptions")
      .insert({
        profile_id: parsed.data.profileId,
        owner_user_id: user.id,
        package_id: pkg.id,
        cycle: parsed.data.cycle,
        status: "active",
        current_period_end: new Date(Date.now() + (parsed.data.cycle === "yearly" ? 365 : 30) * 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    if (sub) {
      await admin.from("payments").insert({
        subscription_id: sub.id,
        stripe_payment_intent_id: `demo_${sub.id}`,
        amount_cents: 0,
        currency: "usd",
        status: "succeeded",
        failure_reason: null,
      });
    }
  }

  await admin.from("agent_events").insert({
    surface: "Upgrade assistant",
    outcome: "converted",
    detail: "demo_mode_instant_upgrade",
  });

  // Mirrors what the real stripe-webhook does for session.metadata.live_request_id
  // (see its header comment) — without this, an upgrade started from an
  // agent's in-chat payment-request link would go through fine in demo mode,
  // but the agent's own "Mark resolved" button would stay locked forever,
  // since nothing ever moved that request's conversion_status off "discussing".
  if (parsed.data.liveRequestId) {
    const { data: request } = await admin
      .from("live_agent_requests")
      .select("id, session_id, profile_id")
      .eq("id", parsed.data.liveRequestId)
      .eq("profile_id", parsed.data.profileId)
      .maybeSingle();

    if (request) {
      await admin.from("live_agent_requests").update({ conversion_status: "payment_succeeded" }).eq("id", request.id);

      if (request.session_id) {
        await admin.from("chat_messages").insert({
          session_id: request.session_id,
          sender: "system",
          body: "Payment received — you're now on Pro!",
        });
      }
    }
  }

  return NextResponse.json({ ok: true, demo: true });
}
