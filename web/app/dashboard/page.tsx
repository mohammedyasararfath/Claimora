import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactSupportButton } from "@/components/dashboard/ContactSupportButton";

const SRS_LEGEND_CLAIMED = ["Reviews & Replies", "Profile Completion", "Connections"];
const SRS_LEGEND_PRO = [...SRS_LEGEND_CLAIMED, "Web Analytics", "Listings"];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase.from("profiles").select("*").eq("owner_user_id", user.id).maybeSingle();

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h2 className="mb-2 font-serif text-lg font-semibold">No profile linked to this account yet</h2>
        <p className="mb-4 text-sm text-ink-soft">
          If you just claimed a profile, this can take a moment to sync. Otherwise, search for your profile to
          get started.
        </p>
        <Button asChild>
          <Link href="/">Search for your profile</Link>
        </Button>
      </main>
    );
  }

  const isPro = profile.status === "pro";
  const legend = isPro ? SRS_LEGEND_PRO : SRS_LEGEND_CLAIMED;
  const srsPercent = Math.round((profile.srs / 850) * 100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      {profile.is_restricted && (
        <div className="mb-4 rounded-md border border-amber bg-amber-soft p-3 text-sm text-amber">
          Some fields are locked pending manual verification of your identity.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="bg-gradient-to-b from-indigo-soft to-transparent">
            <h3 className="font-serif text-base font-semibold">{profile.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {profile.category}
              {profile.city ? ` · ${profile.city}` : ""}
            </p>

            <div className="mt-4 text-center">
              <p className="font-serif text-3xl font-bold">{profile.srs}</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-indigo transition-all" style={{ width: `${srsPercent}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-ink-soft">
                <span>0</span>
                <span>850</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-soft">
              {legend.map((l) => (
                <span key={l} className="rounded-full bg-paper px-2 py-1">
                  {l}
                </span>
              ))}
            </div>

            {!isPro && (
              <Button asChild className="mt-4 w-full">
                <Link href="/dashboard/upgrade">Upgrade to Pro</Link>
              </Button>
            )}
          </Card>

          <ContactSupportButton profileId={profile.id} currentTier={profile.status} currentSrs={profile.srs} />
        </div>

        <div className="flex flex-col gap-4">
          {!isPro && (
            <Card>
              <h4 className="mb-1 font-semibold">Unlock more with Pro</h4>
              <p className="mb-3 text-sm text-ink-soft">
                Get Web Analytics, Listings management, and priority placement guidance.
              </p>
              <Button asChild variant="ai">
                <Link href="/dashboard/upgrade">See plans</Link>
              </Button>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniCard title="Reviews & Replies" desc={`${profile.reviews_count} reviews on file`} />
            <MiniCard title="Profile Completion" desc="Keep your profile details up to date" />
            <MiniCard title="Connections" desc="0 / 7 connected" />
            {isPro && <MiniCard title="Web Analytics" desc="Traffic insights for your profile" />}
            {isPro && <MiniCard title="Listings" desc="Manage your business listings" />}
          </div>
        </div>
      </div>
    </main>
  );
}

function MiniCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Card>
      <p className="mb-1 text-sm font-semibold">{title}</p>
      <p className="text-xs text-ink-soft">{desc}</p>
    </Card>
  );
}
