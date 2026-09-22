# Agent evals

Behavioral checks against the real, deployed `ai-agent-turn` and
`dashboard-copilot` edge functions and a real Anthropic model — not unit
tests. They exist because several real production bugs this session were
exactly the kind of thing these categories catch: the tool-calling loop
silently discarding a good reply and falling back to a generic "trouble
responding" message, and the copilot escalating to a human just to hand over
a payment link instead of showing the in-chat form itself.

## Running

```
npm run test:evals
```

Needs `web/.env.local` populated (same file the app itself uses) — these
tests read `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from it
directly and call the deployed edge functions over the network. They also
spend real Anthropic tokens per run.

Because they exercise a real model, an occasional flake is a signal to
re-run once before treating it as a regression — these are behavioral
assertions, not deterministic snapshots.

## Fixtures

Two permanent fixture profiles back these tests (created once, reused by
every run — see `helpers.ts`):

- `eval-fixture-unclaimed` — an always-unclaimed profile for `ai-agent-turn`
  claim-flow cases.
- `eval-fixture-claimed` — a claimed profile with a real linked account, for
  `dashboard-copilot` cases.

If they don't exist yet (a fresh database), seed them with:

```
node -e '
const fs = require("fs");
const env = {};
fs.readFileSync(".env.local", "utf8").split("\n").forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await admin.from("profiles").upsert({
    slug: "eval-fixture-unclaimed", name: "Eval Fixture Unclaimed", category: "Real Estate Agent",
    brokerage: "Fixture Realty", city: "Columbus, OH", license: "OH-EVAL-0001", status: "unclaimed",
    rating: 4.7, reviews_count: 55, srs: 300, top5: false, phone_e164: "+16145550100",
    email: "eval-fixture-unclaimed@example.com",
  }, { onConflict: "slug" });

  const { data: existing } = await admin.from("profiles").select("owner_user_id").eq("slug", "eval-fixture-claimed").maybeSingle();
  let ownerId = existing?.owner_user_id;
  if (!ownerId) {
    const { data: created } = await admin.auth.admin.createUser({
      email: "eval-fixture-claimed@example.com", password: "Claimora@2026", email_confirm: true,
      user_metadata: { full_name: "Eval Fixture Claimed" },
    });
    ownerId = created?.user?.id;
  }
  await admin.from("profiles").upsert({
    slug: "eval-fixture-claimed", name: "Eval Fixture Claimed", category: "Veterinarian",
    brokerage: "Fixture Animal Clinic", city: "Columbus, OH", license: "OH-EVAL-0002", status: "claimed",
    rating: 4.8, reviews_count: 40, srs: 350, top5: false, phone_e164: "+16145550101",
    email: "eval-fixture-claimed@example.com", snippet: "Fixture profile for automated agent evals.",
    owner_user_id: ownerId, claim_date: new Date().toISOString(), verification_method: "email_otp",
  }, { onConflict: "slug" });
  console.log("fixtures ready");
})();
'
```

Each test creates its own `chat_sessions` row against these fixtures and
cleans it up afterward — the fixture profiles themselves are never mutated
by a passing run (the identity-verification-integrity case explicitly
asserts the fixture profile stays unclaimed).

## Categories

- **Tool-loop completion** (`ai-agent-turn.eval.ts`) — a real reply never gets
  silently replaced by the generic fallback.
- **Identity & verification integrity** (`ai-agent-turn.eval.ts`) — a profile
  is never claimed for a visitor who wasn't verified.
- **No fabricated facts** (both files) — a stated fact (license, brokerage,
  review count) matches what's actually on file, never an invented value.
- **Escalation timing** (`dashboard-copilot.eval.ts`) — interest gets
  qualified first, payment is handled in-chat (never a bare escalation to a
  human just to hand over a link), and a real billing dispute still
  escalates.
- **Upgrade pricing & completion claims** (`dashboard-copilot.eval.ts`) — PRO
  is never claimed as active before a real payment event.

This is a lean, seven-case starting set covering the bug classes actually hit
this session — not the full matrix. Add a case here the next time a real
agent bug gets fixed, so it can't silently come back.
