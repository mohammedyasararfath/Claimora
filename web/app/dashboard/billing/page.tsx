import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/billing");

  const { data: profile } = await supabase.from("profiles").select("id, status").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) redirect("/dashboard");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("cycle, status, current_period_end, packages(name, monthly_price_cents, yearly_price_cents)")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const pkg = subscription?.packages as unknown as { name: string; monthly_price_cents: number; yearly_price_cents: number } | null;
  const priceCents = pkg ? (subscription?.cycle === "yearly" ? pkg.yearly_price_cents : pkg.monthly_price_cents) : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h2 className="font-serif text-xl font-semibold">Billing</h2>

      <Card>
        <CardTitle className="text-base">Current plan</CardTitle>
        {subscription && pkg ? (
          <>
            <CardDescription>
              {pkg.name} · {subscription.cycle} · {priceCents !== null ? formatCents(priceCents) : "—"}/
              {subscription.cycle === "yearly" ? "yr" : "mo"}
            </CardDescription>
            <div className="mt-2 flex justify-between border-t border-dashed border-line pt-2 text-sm">
              <span className="text-ink-soft">Status</span>
              <span className="font-semibold capitalize">{subscription.status}</span>
            </div>
            {subscription.current_period_end && (
              <div className="flex justify-between border-t border-dashed border-line pt-2 text-sm">
                <span className="text-ink-soft">Renews</span>
                <span className="font-semibold">{new Date(subscription.current_period_end).toLocaleDateString()}</span>
              </div>
            )}
          </>
        ) : (
          <CardDescription>You&apos;re on the free Claimed plan.</CardDescription>
        )}
        <Button asChild className="mt-4 w-full">
          <Link href="/dashboard/upgrade">{profile.status === "pro" ? "Change plan" : "Upgrade to Pro"}</Link>
        </Button>
      </Card>
    </div>
  );
}
