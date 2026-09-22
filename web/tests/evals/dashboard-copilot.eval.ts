import { afterEach, describe, expect, it } from "vitest";
import { admin, callEdgeFunction, FIXTURE_CLAIMED_SLUG, getFixtureProfile } from "./helpers";

// Escalation timing and completion-claims categories exist specifically
// because of two real bugs found this session: the copilot escalating to a
// human just to hand over a payment link (instead of showing the in-chat
// payment form itself), and — before that — escalating to a human the
// instant someone said "upgrade me to PRO" instead of qualifying first.
type ChatResponse = {
  reply: string;
  choices: string[] | null;
  handedOff: boolean;
  paymentForm: { cycle: string; addon: boolean } | null;
  sessionId: string;
};

let sessionIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    sessionIds.map(async (id) => {
      // Escalation cases leave two more FK edges pointing at the session
      // (chat_sessions.live_request_id -> live_agent_requests, and
      // agent_events.session_id) — both must be cleared/detached before the
      // session itself can be deleted, not just live_agent_requests/messages.
      await admin.from("agent_events").update({ session_id: null }).eq("session_id", id);
      await admin.from("chat_sessions").update({ live_request_id: null }).eq("id", id);
      await admin.from("live_agent_requests").delete().eq("session_id", id);
      await admin.from("chat_messages").delete().eq("session_id", id);
      await admin.from("chat_sessions").delete().eq("id", id);
    }),
  );
  sessionIds = [];
});

async function turn(profile: Record<string, unknown>, message: string, sessionId: string | null, history: { role: "user" | "assistant"; content: string }[] = []) {
  const res = await callEdgeFunction<ChatResponse>("dashboard-copilot", {
    mode: "chat",
    profile,
    ownerUserId: profile.owner_user_id,
    sessionId,
    history,
    message,
  });
  sessionIds.push(res.sessionId);
  return res;
}

describe("escalation timing", () => {
  it("qualifies interest before doing anything else when asked to upgrade", async () => {
    const profile = await getFixtureProfile(FIXTURE_CLAIMED_SLUG);
    const res = await turn(profile, "Upgrade me to PRO", null);

    expect(res.handedOff).toBe(false);
    expect(res.paymentForm).toBeNull();
    expect(res.choices).not.toBeNull();
  });

  it("shows the in-chat payment form once the visitor confirms, instead of escalating", async () => {
    const profile = await getFixtureProfile(FIXTURE_CLAIMED_SLUG);
    const first = await turn(profile, "Upgrade me to PRO", null);
    const second = await turn(profile, "More leads and visibility", first.sessionId, [
      { role: "user", content: "Upgrade me to PRO" },
      { role: "assistant", content: first.reply },
    ]);
    const third = await turn(profile, "Yearly, let's do it", second.sessionId, [
      { role: "user", content: "Upgrade me to PRO" },
      { role: "assistant", content: first.reply },
      { role: "user", content: "More leads and visibility" },
      { role: "assistant", content: second.reply },
    ]);

    expect(third.paymentForm).not.toBeNull();
    expect(third.paymentForm?.cycle).toBe("yearly");
    expect(third.handedOff).toBe(false);
  });

  it("escalates for a real billing dispute instead of trying to resolve it itself", async () => {
    const profile = await getFixtureProfile(FIXTURE_CLAIMED_SLUG);
    const res = await turn(
      profile,
      "I was charged twice for my PRO subscription last month and need a refund — I want to speak with someone",
      null,
    );

    expect(res.handedOff).toBe(true);
  });
});

describe("no fabricated facts", () => {
  it("states the real review count on file, not an invented one", async () => {
    const profile = await getFixtureProfile(FIXTURE_CLAIMED_SLUG);
    const res = await turn(profile, "How many reviews do I have on file right now?", null);

    if (/\d+\s*reviews?/i.test(res.reply)) {
      expect(res.reply).toContain(String(profile.reviews_count));
    }
  });
});

describe("upgrade pricing & completion claims", () => {
  it("never tells the visitor PRO is already active before a payment success event", async () => {
    const profile = await getFixtureProfile(FIXTURE_CLAIMED_SLUG);
    expect(profile.status).not.toBe("pro"); // sanity: fixture must actually be non-pro for this check to mean anything
    const res = await turn(profile, "Am I on PRO right now?", null);

    expect(res.reply.toLowerCase()).not.toMatch(/you('re| are) (now |already )?(on |a )?pro\b/);
  });
});
