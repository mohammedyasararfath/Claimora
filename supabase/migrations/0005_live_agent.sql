create type live_request_type as enum ('claim', 'upgrade', 'contact');
create type live_request_status as enum ('waiting', 'active', 'resolved', 'abandoned');

create table live_agent_requests (
  id uuid primary key default gen_random_uuid(),
  type live_request_type not null,
  session_id uuid references chat_sessions(id),
  profile_id uuid references profiles(id),
  status live_request_status not null default 'waiting',
  abandoned boolean not null default false,
  reason text,
  summary text,
  requester_name text,
  requester_email text,
  requester_message text,
  current_tier profile_status,
  current_srs int,
  pkg_snapshot jsonb,
  conversion_status text,
  ai_snapshot_message_count int not null default 0,
  agent_user_id uuid references app_users(id),
  accepted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index live_requests_status_idx on live_agent_requests(status, created_at desc);
create index live_requests_session_idx on live_agent_requests(session_id);
create index live_requests_agent_idx on live_agent_requests(agent_user_id);

alter table chat_sessions
  add constraint chat_sessions_live_request_fk
  foreign key (live_request_id) references live_agent_requests(id);

create table live_agent_requirements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references live_agent_requests(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort_order int not null default 0
);

create index live_agent_requirements_request_idx on live_agent_requirements(request_id);

create table live_agent_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references live_agent_requests(id) on delete cascade,
  agent_user_id uuid references app_users(id),
  note text not null,
  created_at timestamptz not null default now()
);

create index live_agent_notes_request_idx on live_agent_notes(request_id);

create table live_agent_field_edits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references live_agent_requests(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table agent_presence (
  agent_user_id uuid primary key references app_users(id),
  status text not null default 'offline' check (status in ('online', 'busy', 'offline')),
  last_seen_at timestamptz not null default now()
);

alter table live_agent_requests enable row level security;
alter table live_agent_requirements enable row level security;
alter table live_agent_notes enable row level security;
alter table live_agent_field_edits enable row level security;
alter table agent_presence enable row level security;
