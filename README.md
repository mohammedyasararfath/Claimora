# Claimora

Production application for "Find, Claim & Build Your Profile" — profile search, AI-assisted claiming, live-agent handoff, Pro subscription upgrade, and an admin console. Built on **Next.js (Vercel)** + **Supabase** (Postgres, Auth, Realtime, Storage, Edge Functions, RLS), per the approved technical implementation plan.

## Repository layout

```
Claimora/
  supabase/          # Database schema (migrations), Edge Functions, local Supabase config
  web/                # Next.js application (deployed to Vercel)
```

## Prerequisites

- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- A Supabase project (free tier is enough for development)
- Accounts/API keys for: Anthropic (Claude), Stripe, Resend (or Postmark), Twilio, Upstash Redis — see [`web/.env.example`](web/.env.example) for the full list. The app **will not silently fall back to mock data** if these are missing — features that need a given integration will surface a clear configuration error instead.

## Getting started (local development)

```bash
# 1. Install app dependencies
cd web
npm install

# 2. Configure environment variables
cp .env.example .env.local
# fill in every value in .env.local — see the comments in that file

# 3. Start Supabase locally (from the repo root, in another terminal)
cd ..
supabase start
supabase db reset      # applies all migrations in supabase/migrations + supabase/seed.sql

# 4. Generate typed DB types (optional but recommended after any schema change)
supabase gen types typescript --local > web/lib/types/database.types.ts

# 5. Run the app
cd web
npm run dev
```

The app expects `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to point at either your local `supabase start` instance or a hosted Supabase project.

## Deploying

- **Database**: `supabase link --project-ref <ref>` then `supabase db push` to apply migrations to your hosted project. Deploy Edge Functions with `supabase functions deploy <name>` (see `supabase/functions/`).
- **Webhooks**: register the Stripe, Resend, and Twilio webhook URLs against the deployed Edge Function endpoints (`supabase/functions/stripe-webhook`, `email-events-webhook`, `sms-events-webhook`) and set the matching `*_WEBHOOK_SECRET` env vars.
- **App**: import this repo into Vercel, set the **Root Directory** to `web`, and configure all environment variables from `web/.env.example` in the Vercel project settings (Production + Preview).

## What's fully implemented vs. what needs configuration

See [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) for a feature-by-feature breakdown of what runs against real Supabase data today versus what is wired up correctly but requires you to supply real third-party credentials before it's live.

## Technical plan

The full architecture, schema rationale, and phased build plan this app was built from lives in the project's implementation-plan document (Supabase schema, RLS design, AI-agent architecture, live-agent workflow, payments, email/SMS, admin, security, testing, and deployment strategy).
