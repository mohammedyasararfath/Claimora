import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmationPoller } from "@/components/payment/ConfirmationPoller";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; demo?: string }>;
}) {
  const { session_id, demo } = await searchParams;

  if (demo === "true") {
    // The demo-upgrade route (app/api/billing/demo-upgrade/route.ts) has
    // already flipped the profile to 'pro' synchronously before redirecting
    // here — unlike the real Stripe path, there's nothing left to poll for.
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft text-2xl text-mint">
          ✓
        </div>
        <h2 className="mb-2 font-serif text-xl font-semibold">You&apos;re PRO</h2>
        <p className="mb-6 text-sm text-ink-soft">Demo mode — no real payment was processed.</p>
        <Button asChild size="lg">
          <Link href="/dashboard?upgraded=1">Go to my dashboard</Link>
        </Button>
      </main>
    );
  }

  if (!session_id) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-sm text-ink-soft">Missing checkout session.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16 text-center">
      <ConfirmationPoller sessionId={session_id} />
    </main>
  );
}
