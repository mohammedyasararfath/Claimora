# Scheduled jobs (pg_cron)

These can't be baked into a migration because they need your **hosted** project's URL and a service-role key, which don't exist yet at migration-write time. After `supabase link` + `supabase db push` to your real project, run the SQL below once via the Supabase SQL Editor (or `supabase db execute`), replacing `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`.

Each job uses `pg_net` (bundled with `pg_cron` on Supabase) to POST to the matching Edge Function.

```sql
-- Claim-email sequence: check every 15 minutes for enrollments due to send.
select cron.schedule(
  'email-sequence-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/email-sequence-tick',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- OTP expiry cleanup, every 5 minutes.
select cron.schedule(
  'otp-cleanup',
  '*/5 * * * *',
  $$ delete from otp_codes where expires_at < now() - interval '1 day'; $$
);

-- Abandoned-session sweep, every 10 minutes.
select cron.schedule(
  'abandoned-session-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/abandoned-session-sweep',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

To list/unschedule: `select * from cron.job;` / `select cron.unschedule('email-sequence-tick');`

Alternatively, use **Vercel Cron** (`vercel.json` → `crons`) hitting a Next.js Route Handler that forwards to the same Edge Functions, protected by the `CRON_SECRET` env var — see `web/app/api/cron/*`. Either scheduler works; don't run both against the same job or sends will duplicate.
