-- Identity ------------------------------------------------------------------

create type user_role as enum ('visitor', 'profile_owner', 'live_agent', 'admin');

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'profile_owner',
  full_name text,
  created_at timestamptz not null default now()
);

-- Auto-provision an app_users row whenever a Supabase Auth user is created,
-- so every authenticated principal always has a role to check in RLS.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into app_users (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Shared "is this caller an admin/live_agent" helpers, used throughout RLS
-- policies (0010). security definer + stable so they can be called cheaply
-- inside policy expressions without each policy re-joining app_users itself.
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

-- Profiles -------------------------------------------------------------------

create type profile_status as enum ('unclaimed', 'claimed', 'pro');
create type verification_method as enum ('email_otp', 'phone_otp', 'claim_link', 'alt_email_manual');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,
  brokerage text,
  city text,
  license text,
  status profile_status not null default 'unclaimed',
  owner_user_id uuid references app_users(id),
  rating numeric(2,1) not null default 0,
  reviews_count int not null default 0,
  srs int not null default 12 check (srs between 0 and 850),
  top5 boolean not null default false,
  phone_e164 text,
  email text,
  snippet text,
  verification_method verification_method,
  is_restricted boolean not null default false,
  claim_date timestamptz,
  sub_start_date timestamptz,
  trial_end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create index profiles_search_idx on profiles using gin (
  to_tsvector('english', name || ' ' || coalesce(city, '') || ' ' || coalesce(category, '') || ' ' || coalesce(brokerage, ''))
);
create index profiles_status_idx on profiles(status);
create index profiles_owner_idx on profiles(owner_user_id);
create unique index profiles_slug_idx on profiles(slug);

create table profile_field_locks (
  profile_id uuid not null references profiles(id) on delete cascade,
  field_name text not null,
  locked_at timestamptz not null default now(),
  primary key (profile_id, field_name)
);

alter table app_users enable row level security;
alter table profiles enable row level security;
alter table profile_field_locks enable row level security;
