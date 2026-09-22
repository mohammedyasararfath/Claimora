"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const COMMAND_CENTER = [
  { href: "/dashboard/search-ranking", label: "Search Ranking", icon: "🔍" },
  { href: "/dashboard/ai-visibility", label: "AI Visibility", icon: "✨" },
  { href: "/dashboard/social-posts", label: "Social Posts", icon: "💬", pro: true },
  { href: "/dashboard/insights", label: "Insights", icon: "📊" },
  { href: "/dashboard/network", label: "Network", icon: "🔗" },
];

const ACCOUNT_CENTER = [
  { href: "/dashboard/profile", label: "Profile", icon: "👤" },
  { href: "/dashboard/connections", label: "Connections", icon: "🔗" },
  { href: "/dashboard/learning-hub", label: "Learning Hub", icon: "🎓" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
  { href: "/dashboard/billing", label: "Billing", icon: "💳" },
];

export function DashboardSidebar({
  isPro,
  isRestricted,
  onboardingDone,
  onboardingTotal,
}: {
  isPro: boolean;
  isRestricted: boolean;
  onboardingDone: number;
  onboardingTotal: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-4 border-r border-line bg-card p-4">
      {!isPro && (
        <Link
          href="/dashboard/profile"
          className="flex items-center justify-between rounded-lg bg-indigo px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <span>👤 Complete Onboarding</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
            {onboardingDone}/{onboardingTotal}
          </span>
        </Link>
      )}

      <NavLink href="/dashboard" pathname={pathname} exact>
        🏠 Home
      </NavLink>

      <div>
        <p className="mb-1.5 px-2 text-[0.68rem] font-bold uppercase tracking-wide text-ink-soft">Command Center</p>
        <div className="flex flex-col gap-0.5">
          {COMMAND_CENTER.map((item) => (
            <NavLink key={item.href} href={item.href} pathname={pathname}>
              <span className="flex flex-1 items-center justify-between">
                <span>
                  {item.icon} {item.label}
                </span>
                {item.pro && !isPro && (
                  <Badge variant="pro" className="ml-2">
                    PRO
                  </Badge>
                )}
              </span>
            </NavLink>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 px-2 text-[0.68rem] font-bold uppercase tracking-wide text-ink-soft">Account Center</p>
        <div className="flex flex-col gap-0.5">
          {ACCOUNT_CENTER.map((item) => (
            <NavLink key={item.href} href={item.href} pathname={pathname}>
              {item.icon} {item.label}
              {item.href === "/dashboard/profile" && isRestricted && " 🔒"}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  pathname,
  exact,
  children,
}: {
  href: string;
  pathname: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-indigo-soft font-semibold text-indigo" : "text-ink-soft hover:bg-paper hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
