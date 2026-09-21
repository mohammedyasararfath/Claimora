import { ConfirmationPoller } from "@/components/payment/ConfirmationPoller";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

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
