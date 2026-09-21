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

-- Shared "is this caller an admin/live_agent" helpers, used throughout RLS policies (0011).
-- security definer + stable so they can be called cheaply inside policy expressions
-- without each policy re-joining app_users itself.
create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from app_users where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() = 'admin', false);
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() in ('admin', 'live_agent'), false);
$$;
