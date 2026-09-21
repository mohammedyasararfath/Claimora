import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";

export default async function ClaimedPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, slug, name, email, status, is_restricted, owner_user_id")
    .eq("id", profileId)
    .single();

  if (!profile || profile.status === "unclaimed") redirect("/");

  // The account may have been created with a different email than the
  // profile's on-file one (always true for the restricted/alt-email path,
  // sometimes true otherwise) — the auth user's actual email is the correct
  // "we emailed you at ___" destination, not profiles.email.
  let loginEmail = profile.email;
  if (profile.owner_user_id) {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(profile.owner_user_id);
    if (data?.user?.email) loginEmail = data.user.email;
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mint-soft text-2xl text-mint">
        ✓
      </div>
      <h2 className="mb-2 font-serif text-xl font-semibold">You&apos;re all set, {profile.name}</h2>
      <p className="mb-6 text-sm text-ink-soft">
        Your profile is live at <span className="font-mono">/p/{profile.slug}</span>. We&apos;ve emailed{" "}
        {loginEmail ?? "your login address"} a link to set your password.
      </p>

      {profile.is_restricted && (
        <p className="mb-6 rounded-md border border-amber bg-amber-soft p-3 text-left text-sm text-amber">
          Some fields (name, license, review replies, review reports) are locked until a team member manually
          verifies your identity — this usually takes under a business day.
        </p>
      )}

      <Button asChild size="lg">
        <Link href="/login">Set your password &amp; log in</Link>
      </Button>
    </main>
  );
}
