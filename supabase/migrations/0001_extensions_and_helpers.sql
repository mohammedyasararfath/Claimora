-- Extensions
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;      -- pgvector, for the RAG knowledge base
create extension if not exists pg_cron;     -- scheduled jobs (email sequence, OTP cleanup, abandoned-session sweep)

-- Shared updated_at trigger
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- auth_role()/is_admin()/is_staff() (used throughout the RLS policies in
-- 0010) live in 0002, right after app_users is created — a `language sql`
-- function body is validated against existing objects at CREATE FUNCTION
-- time, so defining them here (before app_users exists) fails the push.
