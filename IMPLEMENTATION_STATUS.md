# Implementation status

What's real (backed by Supabase, no mock data) vs. what's wired correctly but needs your credentials/configuration before it's live. Verified against an actual `npm run build` (type-checked, linted, all 26 routes compile) before this was written.

## Fully implemented, real Supabase data — no mock/static data anywhere

- **Search** — Postgres query (`ILIKE` fallback if full-text search errors) against the real `profiles` table.
- **Claim / create session start** — `chat_sessions` rows, signed httpOnly cookie for anonymous visitors, real claim-email-link token validation against `claim_tokens` (hashed, single-use, expiring).
- **OTP verification** — server-generated, hashed, rate-limited codes via `otp-issue`/`otp-verify` Edge Functions; never exposed to the client.
- **AI agent chat** — real Claude tool-calling loop (`ai-agent-turn` Edge Function) against live `chat_sessions`/`chat_messages`/`profiles` data; creates a real Supabase Auth account + profile ownership on `complete_claim`/`restricted_claim`.
- **Live-agent queue & console** — real `live_agent_requests` tables, genuine Supabase Realtime for staff (RLS-authenticated), requirements checklist, internal notes (never visible to the visitor), accept/resolve flows.
- **Claim confirmation** — `confirm_claim()` Postgres function (security-definer, RLS-respecting).
- **Dashboard** — real profile/SRS data for the signed-in owner.
- **Pro upgrade pricing** — server-computed from `packages`/`addons`/`promo_codes` tables (`lib/payments/pricing.ts`), never trusted from the client.
- **Stripe checkout + webhook** — real Stripe Checkout Session creation and a webhook that is the *only* place `profiles.status` becomes `'pro'`.
- **Admin dashboard** — real profile table with filters/pagination, email-journey drill-down from real `email_events`/`campaign_enrollments`.
- **Claim-email sequence** — `email-sequence-tick` Edge Function, real Resend sends, real 15-day interval scheduling, real unsubscribe suppression list.
- **RLS** — every table has real policies (see `supabase/migrations/0010_rls_policies.sql`); default-deny, not a convention.

## Works once you supply credentials (code path is real, not stubbed)

| Feature | What you need to configure |
| --- | --- |
| AI agent responses | `ANTHROPIC_API_KEY` (Anthropic account) |
| RAG-grounded agent answers | `OPENAI_API_KEY` for embeddings (optional — agent still works without it, just without knowledge-base retrieval); run an embedding backfill script for `knowledge_chunks.embedding` (not included — see "Not yet built" below) |
| OTP email | `RESEND_API_KEY`, a verified sending domain |
| OTP SMS | `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `FROM_NUMBER`, a provisioned number |
| Claim-email campaigns | Same Resend key; schedule `email-sequence-tick` via `supabase/CRON_SETUP.md` (pg_cron) or Vercel Cron (`vercel.json`, already configured) |
| Pro checkout | `STRIPE_SECRET_KEY`, and **you must set `packages.stripe_monthly_price_id` / `stripe_yearly_price_id`** (and the equivalent on `addons`) to real Stripe Price ids created in your Stripe Dashboard — checkout returns a clear 503 until these are set, it does not fall back to fake pricing |
| Stripe webhooks | `STRIPE_WEBHOOK_SECRET`; register `https://<project>.supabase.co/functions/v1/stripe-webhook` as the endpoint in Stripe |
| Email delivery tracking | `RESEND_WEBHOOK_SECRET`; register the webhook in Resend |
| SMS delivery tracking | Twilio status callback pointed at `sms-events-webhook` |
| Rate limiting | Currently only OTP issuance is rate-limited (via a direct DB count check, not Redis). `UPSTASH_REDIS_REST_URL`/`TOKEN` are listed in `.env.example` for extending this to search/agent-turn endpoints — that extension is not yet wired in code |

## Deliberately simplified vs. the full 19-section plan (real, but smaller in scope)

- **Dashboard "Ask AI"** — implemented as a direct "Talk to a person" button creating a real `live_agent_requests` row (type `upgrade`/`contact`), rather than the full Claude tool-calling loop the claim/create flow has. The claim/create AI agent is fully built; a second AI surface for post-claim support chat is a natural next addition, not yet built.
- **Payment UI** — uses Stripe **Checkout** (hosted, redirect-based) rather than an embedded Payment Element form. This is a deliberate, more secure default (zero PCI scope touches your code) and is a completely real integration — just a different, standard Stripe pattern than a custom card form.
- **Realtime for anonymous chat** — pre-authentication visitors (searching → claiming, before their account exists) poll every 2.5s for new messages instead of using Supabase Realtime, because Realtime is RLS-gated and RLS has no way to identify a specific anonymous browser. Authenticated surfaces (agent console, dashboard) use genuine Realtime. This is documented in `lib/chat/session-auth.ts` and `app/api/agent/session/[sessionId]/messages/route.ts`.
- **Evals pipeline (§15 of the plan)** — the `eval_runs`/`eval_incidents` tables exist in the schema; no CI eval suite populates them yet.
- **`live_agent_field_edits` audit trail** — table and RLS exist; no UI writes to it yet (the editable-fields panel described in the plan isn't built — the current agent console panel is read/chat/checklist/notes only).

## Not yet built

- Admin campaign management UI (pause/create campaigns) — `campaigns` table and RLS exist, only the read-side (email journey) has a UI.
- `admin_audit_log` — table + RLS exist; nothing writes to it yet (no admin mutation UI exists beyond reads).
- Embedding backfill script for the RAG knowledge base (`scripts/embed-knowledge.ts` referenced in `supabase/seed.sql`'s comment — not created).
- End-to-end/integration/RLS test suites from plan §15 — only representative unit tests exist (`web/tests/unit`).
- Custom domain, Sentry wiring, CI/CD workflow file.

## Before you can run this for real

1. Create a Supabase project, `supabase link`, `supabase db push` (applies all migrations), `supabase db execute -f supabase/seed.sql` (or include seed in your workflow).
2. Deploy Edge Functions: `supabase functions deploy <name>` for each folder under `supabase/functions/`.
3. Set Edge Function secrets: `supabase secrets set ANTHROPIC_API_KEY=... RESEND_API_KEY=... OTP_HASH_PEPPER=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APP_URL=... CRON_SECRET=...` (see each function file's imports for its exact required vars).
4. Create Stripe Products/Prices, write their ids into `packages`/`addons`.
5. Fill `web/.env.local` from `web/.env.example`.
6. `cd web && npm install && npm run build` to confirm locally before deploying to Vercel (Root Directory = `web`).
