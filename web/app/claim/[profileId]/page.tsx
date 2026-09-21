import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClaimLandingCta } from "@/components/results/ClaimLandingCta";

export default async function ClaimLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { profileId } = await params;
  const { token } = await searchParams;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, category, city, status")
    .eq("id", profileId)
    .single();

  if (!profile) redirect("/");

  if (profile.status !== "unclaimed") {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-center">
        <h2 className="mb-2 font-serif text-xl font-semibold">This profile is already claimed</h2>
        <p className="text-sm text-ink-soft">If this is you and you&apos;ve lost access, contact support.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-center">
      <h2 className="mb-2 font-serif text-2xl font-semibold">Claim {profile.name}&apos;s profile</h2>
      <p className="mb-6 text-sm text-ink-soft">
        {profile.category}
        {profile.city ? ` · ${profile.city}` : ""}. Claiming lets you verify your details, reply to reviews, and
        control what visitors see.
      </p>
      <ClaimLandingCta profileId={profile.id} token={token} />
    </main>
  );
}
