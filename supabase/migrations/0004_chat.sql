create type chat_mode as enum ('claim', 'create');
create type chat_status as enum (
  'active', 'live_waiting', 'live_active', 'ready_to_claim', 'claimed', 'handed_off', 'abandoned'
);

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  anon_token text unique,                 -- signed cookie value for pre-auth visitors; null once claimed
  visitor_user_id uuid references app_users(id),
  profile_id uuid references profiles(id),
  mode chat_mode not null,
  status chat_status not null default 'active',
  intent text,
  fields jsonb not null default '{}'::jsonb,
  bio_state jsonb,
  pre_verified jsonb,
  claim_source text,
  live_request_id uuid,                   -- fk added in 0005 once live_agent_requests exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger chat_sessions_set_updated_at
  before update on chat_sessions
  for each row execute function set_updated_at();

create index chat_sessions_visitor_idx on chat_sessions(visitor_user_id);
create index chat_sessions_profile_idx on chat_sessions(profile_id);
create index chat_sessions_status_idx on chat_sessions(status, created_at desc);

create type chat_sender as enum ('visitor', 'agent', 'system', 'liveagent', 'bio_proposal');

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  sender chat_sender not null,
  agent_name text,
  body text not null,
  is_open_question boolean not null default false,
  created_at timestamptz not null default now()
);

create index chat_messages_session_idx on chat_messages(session_id, created_at);

create table chat_graph_reads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  field_name text not null,
  value_returned text,
  created_at timestamptz not null default now()
);

create index chat_graph_reads_session_idx on chat_graph_reads(session_id);

create table chat_open_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  topic text not null,
  created_at timestamptz not null default now()
);

create index chat_open_questions_session_idx on chat_open_questions(session_id);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table chat_graph_reads enable row level security;
alter table chat_open_questions enable row level security;
