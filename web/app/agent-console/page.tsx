import { createClient } from "@/lib/supabase/server";
import { QueueConsole } from "@/components/live-agent/QueueConsole";

export default async function AgentConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appUser } = user
    ? await supabase.from("app_users").select("full_name, role").eq("id", user.id).single()
    : { data: null };

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
