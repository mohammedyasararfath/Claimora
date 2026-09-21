import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifyFlow } from "@/components/verify/VerifyFlow";
import { maskEmail, maskPhone } from "@/lib/utils";

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { profileId } = await params;
  const { session } = await searchParams;

  if (!session) {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, phone_e164")
    .eq("id", profileId)
    .single();

  if (!profile) {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <h2 className="mb-1 font-serif text-xl font-semibold">Verify it&apos;s you</h2>
      <p className="mb-6 text-sm text-ink-soft">
        We&apos;ll send a one-time code to confirm you&apos;re {profile.name}.
      </p>
      <VerifyFlow
        sessionId={session}
        profileId={profile.id}
        maskedEmail={profile.email ? maskEmail(profile.email) : null}
        maskedPhone={profile.phone_e164 ? maskPhone(profile.phone_e164) : null}
      />
    </main>
  );
}
