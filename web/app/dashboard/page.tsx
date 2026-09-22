import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callEdgeFunction } from "@/lib/supabase/functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactSupportButton } from "@/components/dashboard/ContactSupportButton";
import { ShareProfileLinkButton } from "@/components/dashboard/ShareProfileLinkButton";
import { WriteArticleButton } from "@/components/dashboard/WriteArticleButton";
import { DashboardCopilot } from "@/components/dashboard/DashboardCopilot";
import { onboardingProgress } from "./layout";

// Exact hex values from the artifact's SRS legend — kept literal (not mapped
// onto the app's HSL theme tokens) since these are meant to be fixed,
// distinguishing category colors, not theme-adaptive chrome.
const SRS_LEGEND_CLAIMED = [
  { label: "Reviews & Replies", color: "#5FA96A" },
  { label: "Profile Completion", color: "#4338CA" },
  { label: "Connections", color: "#3FB8C4" },
];
const SRS_LEGEND_PRO = [
  { label: "Reviews & Replies", color: "#5FA96A" },
  { label: "Web Analytics", color: "#4338CA" },
  { label: "Profile Completion", color: "#9B5FE0" },
  { label: "Connections", color: "#3FB8C4" },
  { label: "Listings", color: "#D98A3D" },
];

function firstNameLastInitial(name: string): string {
  const parts = name.trim().split(" ");
  const last = parts[parts.length - 1];
  if (parts.length < 2 || !last) return name;
  return `${parts[0]} ${last[0]}.`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;
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
  const { done, total } = onboardingProgress(profile);
  const isNew = profile.claim_date ? Date.now() - new Date(profile.claim_date).getTime() < 60 * 60 * 1000 : false;

  const { data: insightData } = await callEdgeFunction<{ insight?: string }>("dashboard-copilot", {
    mode: "insight",
    profile,
  });
  const insight = insightData?.insight ?? "Earn Search Rank Score points by receiving and replying to reviews.";

  return (
    <div className="flex flex-col gap-4">
      {upgraded === "1" && isPro && (
        <div className="rounded-lg border border-mint bg-mint-soft p-3 text-sm font-semibold text-mint">
          🚀 You&apos;re PRO now, {profile.name} — the full 850-point score, priority placement, and your PRO badge
          are live.
        </div>
      )}
      {!upgraded && profile.is_restricted && (
        <div className="rounded-lg border border-amber bg-amber-soft p-3 text-sm text-amber">
          ⏳ Welcome, {profile.name} — you&apos;re claimed, but a few fields are locked until our team manually
          verifies you.
        </div>
      )}
      {!upgraded && !profile.is_restricted && isNew && (
        <div className="rounded-lg border border-mint bg-mint-soft p-3 text-sm text-mint">
          🎉 Welcome, {profile.name} — your profile is live. Let&apos;s fill in a few more details to boost your
          score.
        </div>
      )}
      {!upgraded && !profile.is_restricted && !isNew && (
        <div className="rounded-lg border border-line bg-card p-3 text-sm text-ink-soft">
          🎉 Welcome back, {profile.name} — your profile is claimed{isPro ? " and verified" : ""}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_320px]">
        {/* Left column: profile card + writing studio */}
        <div className="flex flex-col gap-4">
          <Card className="bg-gradient-to-b from-indigo-soft to-transparent">
            <h3 className="flex items-center gap-2 font-serif text-base font-semibold">
              {firstNameLastInitial(profile.name)}
              {isPro && <Badge variant="pro">PRO</Badge>}
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              You are ranked in the {profile.category} directory for {profile.city ?? "your area"}.
            </p>

            <Button asChild variant="ai" className="mt-4 w-full">
              <Link href="/dashboard/upgrade">▶ Play Game</Link>
            </Button>

            <div className="mt-4 text-center">
              <p className="font-serif text-3xl font-bold">{profile.srs}</p>
              <p className="text-xs text-ink-soft">Search Rank Score®</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-indigo transition-all" style={{ width: `${srsPercent}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-ink-soft">
                <span>0</span>
                <span>850</span>
              </div>
            </div>

            <div className="mt-4">
              <ShareProfileLinkButton slug={profile.slug} label={isPro ? "Request Review" : "Share Profile Link to Request Reviews"} />
            </div>
          </Card>

          <ContactSupportButton profileId={profile.id} currentTier={profile.status} currentSrs={profile.srs} />

          <Card>
            <p className="mb-1 text-sm font-semibold">Your AI Writing Studio</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold">4</span>
              <span className="text-xs text-ink-soft">Authority Score</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-paper py-2">
                <p className="font-serif text-lg font-bold">0</p>
                <p className="text-xs text-ink-soft">Articles</p>
              </div>
              <div className="rounded-md bg-paper py-2">
                <p className="font-serif text-lg font-bold">0</p>
                <p className="text-xs text-ink-soft">Answers</p>
              </div>
            </div>
            <WriteArticleButton />
          </Card>
        </div>

        {/* Middle column: webinar banner, SRS overview, mini-cards, unlock cards */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-gradient-to-r from-violet to-indigo p-4 text-white">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.68rem] font-bold uppercase">
              Live Webinar
            </span>
            <h4 className="mt-1.5 font-serif text-lg font-semibold">Build a Reputation that Brings Customers to You.</h4>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-serif text-base font-semibold">Search Rank Score Overview</p>
              <p className="text-sm text-ink-soft">{profile.srs} of 850 Possible</p>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-indigo transition-all" style={{ width: `${srsPercent}%` }} />
            </div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-ink-soft">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <p className="rounded-md bg-violet-soft p-2.5 text-sm">
              <b>AI Copilot:</b> {insight}
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {isPro && <MiniCard title="Web Analytics" desc="0 of 250 points" pct={0} />}
            <MiniCard
              title="Reviews & Replies"
              desc={profile.reviews_count > 0 ? `${profile.reviews_count} reviews on file` : "No recent reviews to reply"}
            />
            <MiniCard title="Profile Completion" desc={`${total - done} incomplete items`} pct={Math.round((done / total) * 100)} />
            <MiniCard title="Connections" desc="0 of 7 connections" />
            {isPro && <MiniCard title="Listings" desc="0 of 100 points" pct={0} />}
          </div>

          {!isPro && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <UnlockCard
                points="+250"
                headline="Boost your search rank by up to 250 points"
                sub="Our AI Analysis of Your Personal Website"
              />
              <UnlockCard
                points="+100"
                headline="Earn 100 more Search Rank points"
                sub="Manage 50+ Profiles for Search, Social & Map"
              />
            </div>
          )}
        </div>

        {/* Right column: AI Copilot */}
        <DashboardCopilot />
      </div>
    </div>
  );
}

function MiniCard({ title, desc, pct }: { title: string; desc: string; pct?: number }) {
  return (
    <Card>
      <p className="mb-1 text-sm font-semibold">
        {title} <span className="float-right text-ink-soft">›</span>
      </p>
      <p className="text-xs text-ink-soft">{desc}</p>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-indigo" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  );
}

function UnlockCard({ points, headline, sub }: { points: string; headline: string; sub: string }) {
  return (
    <Link
      href="/dashboard/upgrade"
      className="block rounded-lg bg-ink p-4 text-white transition-opacity hover:opacity-90"
    >
      <p className="font-serif text-xl font-bold text-mint">{points}</p>
      <p className="mt-1 text-sm">{headline}</p>
      <p className="mt-1.5 text-sm font-bold">{sub}</p>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber">Unlock more points</p>
    </Link>
  );
}
