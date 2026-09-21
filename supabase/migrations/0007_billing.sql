create type billing_cycle as enum ('monthly', 'yearly');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');

create table packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price_cents int not null,
  yearly_price_cents int not null,
  stripe_monthly_price_id text,
  stripe_yearly_price_id text
);

create table addons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price_cents int not null,
  yearly_price_cents int not null,
  bundled_only boolean not null default false,
  stripe_monthly_price_id text,
  stripe_yearly_price_id text
);

create table promo_codes (
  code text primary key,
  description text,
  trial_charge_cents int,
  stripe_promotion_code_id text,
  active boolean not null default true,
  expires_at timestamptz
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  owner_user_id uuid not null references app_users(id),
  package_id uuid not null references packages(id),
  addon_ids uuid[] not null default '{}',
  cycle billing_cycle not null,
  promo_code text references promo_codes(code),
  status subscription_status not null default 'incomplete',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

create index subscriptions_profile_idx on subscriptions(profile_id);
create index subscriptions_owner_idx on subscriptions(owner_user_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  request_id uuid references live_agent_requests(id),
  stripe_payment_intent_id text unique,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index payments_subscription_idx on payments(subscription_id);

create table stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table packages enable row level security;
alter table addons enable row level security;
alter table promo_codes enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table stripe_webhook_events enable row level security;
