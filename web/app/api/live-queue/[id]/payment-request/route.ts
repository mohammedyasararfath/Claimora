import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveQueuePaymentRequestSchema } from "@/lib/validation/schemas";
import { quotePrice } from "@/lib/payments/pricing";
import { encodePaymentForm } from "@/lib/payments/paymentFormMarker";

// Builds (and, on repeat calls, re-sends) the in-chat payment request a live
// agent hands an "upgrade" visitor — see the header comment in
// supabase/functions/stripe-webhook/index.ts, which already assumed this
// existed. Drops an inline payment-form message into the visitor's dashboard
// chat rather than a clickable link — the visitor pays right there, without
// leaving the conversation, same as the AI copilot's own show_payment_form
// tool. This never flips profiles.status itself: it only stores what was
// offered (pkg_snapshot) and the true "did payment succeed" signal still
// only ever comes from the Stripe webhook (or, in DEMO_MODE, from
// /api/billing/demo-upgrade) — matching the webhook's own note that this
// route deliberately never sets status='pro' synchronously.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = liveQueuePaymentRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("full_name").eq("id", user.id).single();

  const { data: request } = await supabase
    .from("live_agent_requests")
    .select("id, type, session_id")
    .eq("id", id)
    .single();

  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.type !== "upgrade") {
    return NextResponse.json({ error: "payment requests only apply to upgrade requests" }, { status: 400 });
  }

  const quote = await quotePrice({ cycle: parsed.data.cycle, addon: parsed.data.addon });

  // "staff manage queue" (RLS) is the actual enforcement here — a non-staff
  // caller's update simply matches zero rows, same pattern as accept/resolve.
  const { error: updateError } = await supabase
    .from("live_agent_requests")
    .update({
      conversion_status: "awaiting_payment",
      pkg_snapshot: { ...quote, sentAt: new Date().toISOString(), sentBy: appUser?.full_name ?? user.email },
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (request.session_id) {
    await supabase.from("chat_messages").insert({
      session_id: request.session_id,
      sender: "liveagent",
      agent_name: appUser?.full_name ?? "Support",
      body: encodePaymentForm({ cycle: parsed.data.cycle, addon: parsed.data.addon, liveRequestId: id }),
    });
  }

  return NextResponse.json({ ok: true, quote });
}
