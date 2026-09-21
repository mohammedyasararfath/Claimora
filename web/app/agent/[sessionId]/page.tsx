import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatPanel } from "@/components/agent-chat/ChatPanel";

export default async function AgentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Reading via the admin client here is safe and necessary: this page must
  // render for anonymous (pre-auth) visitors whose session isn't covered by
  // RLS yet (see lib/chat/session-auth.ts). Client-side writes/reads for the
  // actual chat interaction still go through the authorized, cookie-checked
  // API routes — this initial load is read-only page data.
  const admin = createAdminClient();
  const { data: session } = await admin.from("chat_sessions").select("*").eq("id", sessionId).single();

  if (!session) redirect("/");

  const { data: profile } = session.profile_id
    ? await admin.from("profiles").select("id, name, category, city, brokerage").eq("id", session.profile_id).single()
    : { data: null };

  const { data: messages } = await admin
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (session.status === "claimed") {
    redirect(`/claimed/${session.profile_id}`);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            session.mode === "claim" ? "bg-indigo-soft text-indigo" : "bg-violet-soft text-violet"
          }`}
        >
          {session.mode === "claim" ? "CLAIMING" : "BUILDING NEW PROFILE"}
        </span>
        {profile && <h2 className="font-serif text-lg font-semibold">{profile.name}</h2>}
      </div>
      <ChatPanel
        sessionId={sessionId}
        mode={session.mode}
        status={session.status}
        initialMessages={messages ?? []}
        initialFields={(session.fields as Record<string, unknown>) ?? {}}
        initialBioState={session.bio_state}
        profile={profile}
      />
    </main>
  );
}
