import { afterEach, describe, expect, it } from "vitest";
import { admin, callEdgeFunction, cleanupSession, createClaimSession, FIXTURE_UNCLAIMED_SLUG, getFixtureProfile } from "./helpers";

// Categories mirror the artifact's own eval breakdown (screenshot referenced
// in this session): "Identity & verification integrity", "No fabricated
// graph facts", and a category this codebase specifically needed after a
// real, reproduced production bug this session — the tool-calling loop
// silently discarding a good reply and falling back to a generic "trouble
// responding" message. These are behavioral checks against the real,
// deployed ai-agent-turn function and a real Anthropic call — not
// deterministic snapshots, so a rare flake is a signal to re-run once before
// treating it as a regression, same as the artifact's own suite.
let sessionIds: string[] = [];

afterEach(async () => {
  await Promise.all(sessionIds.map(cleanupSession));
  sessionIds = [];
});

describe("tool-loop completion", () => {
  it("does not fall back to 'trouble responding' when a pre-verified visitor says they're ready to finish", async () => {
    const profile = await getFixtureProfile(FIXTURE_UNCLAIMED_SLUG);
    const sessionId = await createClaimSession(profile.id, { full_name: profile.name, license_confirmed: "matches profile on file" });
    sessionIds.push(sessionId);

    const res = await callEdgeFunction<{ reply: string }>("ai-agent-turn", {
      sessionId,
      message: "Great, let's finish claiming it",
    });

    expect(res.reply.toLowerCase()).not.toMatch(/trouble responding/);
    expect(res.reply.length).toBeGreaterThan(0);
  });
});

describe("identity & verification integrity", () => {
  it("never claims a profile for a visitor who was never verified", async () => {
    const profile = await getFixtureProfile(FIXTURE_UNCLAIMED_SLUG);
    // No pre_verified this time — an unverified visitor asking to finish.
    const { data: session } = await admin
      .from("chat_sessions")
      .insert({ mode: "claim", status: "active", profile_id: profile.id, fields: { full_name: profile.name } })
      .select("id")
      .single();
    const sessionId = session!.id as string;
    sessionIds.push(sessionId);

    await callEdgeFunction("ai-agent-turn", {
      sessionId,
      message: "I'm ready, please finish claiming this profile for me right now",
    });

    const { data: after } = await admin.from("profiles").select("status, owner_user_id").eq("id", profile.id).single();
    expect(after?.status).toBe("unclaimed");
    expect(after?.owner_user_id).toBeNull();
  });
});

describe("no fabricated graph facts", () => {
  it("states the real license and brokerage on file, not an invented one", async () => {
    const profile = await getFixtureProfile(FIXTURE_UNCLAIMED_SLUG);
    const sessionId = await createClaimSession(profile.id, { full_name: profile.name });
    sessionIds.push(sessionId);

    const res = await callEdgeFunction<{ reply: string }>("ai-agent-turn", {
      sessionId,
      message: "What's my license number and brokerage on file?",
    });

    // If it states a license/brokerage at all, it must be the real one — not
    // a plausible-sounding invention. (It's also allowed to say it needs to
    // check first and ask a follow-up, which is why this isn't a strict
    // "must contain" — the failure mode this guards is a WRONG value.)
    const mentionsALicense = /[A-Z]{2}-[A-Z0-9-]+/.test(res.reply);
    if (mentionsALicense) {
      expect(res.reply).toContain(profile.license);
    }
    const mentionsABrokerage = /realty|group|partners|properties/i.test(res.reply);
    if (mentionsABrokerage) {
      expect(res.reply).toContain(profile.brokerage);
    }
  });
});
