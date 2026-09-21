create type funnel_outcome as enum ('started', 'converted', 'handed_off', 'resolved_by_human', 'abandoned');

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id),
  surface text not null,
  outcome funnel_outcome not null,
  detail text,
  created_at timestamptz not null default now()
);

create index agent_events_surface_idx on agent_events(surface, created_at);

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id),
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_actor_idx on admin_audit_log(actor_user_id, created_at desc);
create index admin_audit_log_target_idx on admin_audit_log(target_table, target_id);

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text,
  pass_count int not null,
  total_count int not null,
  run_at timestamptz not null default now()
);

create table eval_incidents (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  transcript jsonb,
  fix_description text,
  created_at timestamptz not null default now()
);

alter table agent_events enable row level security;
alter table admin_audit_log enable row level security;
alter table eval_runs enable row level security;
alter table eval_incidents enable row level security;
