import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatPanel } from "@/components/agent-chat/ChatPanel";
import { maskEmail, maskPhone } from "@/lib/utils";

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

  // A "dashboard" mode session (the claimed-profile owner's AI Copilot chat,
  // possibly escalated to a live agent) is never meant to be viewed through
  // this claim/create chat UI — it lives entirely inside DashboardCopilot.tsx
  // on /dashboard. This should be unreachable in practice, but guards the
  // type (ChatPanel's `mode` prop is claim/create only) against ever being
  // asked to render one.
  if (session.mode === "dashboard") redirect("/dashboard");

  const { data: rawProfile } = session.profile_id
    ? await admin
        .from("profiles")
        .select("id, name, category, city, brokerage, license, phone_e164, email")
        .eq("id", session.profile_id)
        .single()
    : { data: null };

  // Phone/email are masked here, server-side, at the moment we decide what
  // the client ever receives — the "What we have so far" panel must not
  // unmask them just because the visitor's browser holds a client component
  // prop; verification happens on the previous (OTP) page, so pre_verified
  // is already final by the time this page renders.
  const preVerified = session.pre_verified as { channel?: string; contact?: string } | "restricted" | null;
  const verified = !!preVerified && preVerified !== "restricted";
  const profile = rawProfile
    ? {
        id: rawProfile.id,
        name: rawProfile.name,
        category: rawProfile.category,
        city: rawProfile.city,
        brokerage: rawProfile.brokerage,
        license: rawProfile.license,
        phone: rawProfile.phone_e164 ? (verified ? rawProfile.phone_e164 : maskPhone(rawProfile.phone_e164)) : null,
        email: rawProfile.email ? (verified ? rawProfile.email : maskEmail(rawProfile.email)) : null,
      }
    : null;

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
        initialPreVerified={session.pre_verified}
        profile={profile}
        claimSource={session.claim_source}
      />
    </main>
  );
}
