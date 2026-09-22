import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QueueConsole } from "@/components/live-agent/QueueConsole";

export default async function AgentConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unlike every other protected page in the app, this one had no auth guard
  // at all: an anonymous visit silently rendered a blank "Queue (0)" console
  // (RLS filters live_agent_requests to nothing for a non-staff caller, so it
  // never errored) instead of sending them to log in — and login's own
  // `next` param handling only works if the page that bounced them there
  // actually sets it, which this page never did either.
  if (!user) redirect("/login?next=/agent-console");

  const { data: appUser } = await supabase.from("app_users").select("full_name, role").eq("id", user.id).maybeSingle();

  if (!appUser || (appUser.role !== "admin" && appUser.role !== "live_agent")) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h2 className="mb-2 font-serif text-lg font-semibold">Access restricted</h2>
        <p className="text-sm text-ink-soft">
          The Live Agent Console is only available to Claimora staff accounts. You&apos;re signed in as{" "}
          {user.email}, which doesn&apos;t have staff access.
        </p>
      </main>
    );
  }

  const { data: requests } = await supabase
    .from("live_agent_requests")
    .select("*")
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold">Live Agent Console</h2>
        <span className="rounded-full bg-slate-soft px-3 py-1 text-xs font-semibold text-slate">
          Viewing as: {appUser?.full_name ?? user?.email} ({appUser?.role === "admin" ? "Admin" : "Onboarding Team"})
        </span>
      </div>
      <QueueConsole initialRequests={requests ?? []} />
    </main>
  );
}
