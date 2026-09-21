import { createClient } from "@/lib/supabase/server";
import { QueueConsole } from "@/components/live-agent/QueueConsole";

export default async function AgentConsolePage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("live_agent_requests")
    .select("*")
    .in("status", ["waiting", "active"])
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="mb-4 font-serif text-xl font-semibold">Live Agent Console</h2>
      <QueueConsole initialRequests={requests ?? []} />
    </main>
  );
}
