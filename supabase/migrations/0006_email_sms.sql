create type email_event_status as enum (
  'queued', 'received', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed'
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'claim_sequence',
  sequence_length int not null default 3,
  interval_days int not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  profile_id uuid not null references profiles(id) on delete cascade,
  emails_sent int not null default 0,
  next_scheduled_at timestamptz,
  stopped_reason text,
  created_at timestamptz not null default now(),
  unique (campaign_id, profile_id)
);

create index campaign_enrollments_due_idx on campaign_enrollments(next_scheduled_at)
  where stopped_reason is null;

alter table claim_tokens
  add constraint claim_tokens_enrollment_fk
  foreign key (campaign_enrollment_id) references campaign_enrollments(id);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references campaign_enrollments(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  sequence_num int not null,
  provider_message_id text,
  status email_event_status not null default 'queued',
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  spam_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_events_profile_idx on email_events(profile_id, sequence_num);
create index email_events_provider_msg_idx on email_events(provider_message_id);

create table sms_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  purpose text not null,
  provider_message_sid text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index sms_events_provider_sid_idx on sms_events(provider_message_sid);

create table email_suppressions (
  email text primary key,
  reason text not null default 'unsubscribed',
  created_at timestamptz not null default now()
);

alter table campaigns enable row level security;
alter table campaign_enrollments enable row level security;
alter table email_events enable row level security;
alter table sms_events enable row level security;
alter table email_suppressions enable row level security;
