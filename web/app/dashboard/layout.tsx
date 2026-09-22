import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Real onboarding-completion signal, derived from fields that actually exist
// on the profile — not a hardcoded fraction. Each item only counts once the
// data backing it is genuinely present.
export function onboardingProgress(profile: {
  brokerage: string | null;
  license: string | null;
  phone_e164: string | null;
  email: string | null;
  snippet: string | null;
  city: string | null;
  is_restricted: boolean;
  verification_method: string | null;
  reviews_count: number;
}): { done: number; total: number } {
  const checks = [
    !!profile.city,
    !!profile.brokerage,
    !!profile.license,
    !!profile.phone_e164,
    !!profile.email,
    !!profile.snippet,
    !!profile.verification_method && !profile.is_restricted,
    profile.reviews_count > 0,
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, name, status, brokerage, license, phone_e164, email, snippet, city, is_restricted, verification_method, reviews_count",
    )
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!profile) return <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>;

  const isPro = profile.status === "pro";
  const { done, total } = onboardingProgress(profile);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
      <DashboardSidebar
        isPro={isPro}
        isRestricted={profile.is_restricted}
        onboardingDone={done}
        onboardingTotal={total}
      />
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-line bg-card px-6 py-3">
          <span className="text-sm font-semibold text-ink-soft">Dashboard</span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Viewing as</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-soft text-[0.65rem] font-bold text-indigo">
              {initials(profile.name)}
            </span>
            <span className="font-semibold">{profile.name}</span>
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
