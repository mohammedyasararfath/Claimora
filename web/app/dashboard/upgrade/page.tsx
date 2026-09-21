import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PackageBuilder } from "@/components/packages/PackageBuilder";

export default async function UpgradePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/upgrade");

  const { data: profile } = await supabase.from("profiles").select("id, name, status").eq("owner_user_id", user.id).maybeSingle();
  if (!profile) redirect("/dashboard");

  if (profile.status === "pro") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 text-center">
        <h2 className="font-serif text-2xl font-semibold">
          Build your <span className="text-coral">bundle</span>
        </h2>
        <p className="text-sm text-ink-soft">Everything you need to grow your Search Rank Score, in one plan.</p>
      </div>
      <PackageBuilder profileId={profile.id} />
    </main>
  );
}
