create type otp_channel as enum ('email', 'sms');

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  session_id uuid,
  channel otp_channel not null,
  destination text not null,
  code_hash text not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index otp_codes_profile_idx on otp_codes(profile_id, created_at desc);
create index otp_codes_session_idx on otp_codes(session_id, created_at desc);

alter table otp_codes enable row level security;
-- otp_codes has no client-facing RLS policy at all: only the service-role key
-- (used exclusively by the otp-issue / otp-verify Edge Functions) may touch this
-- table. Never expose the code hash, destination, or attempt count to any client role.

create table claim_tokens (
  token_hash text primary key,          -- sha256 of the token; the raw token is only ever in the emailed URL
  profile_id uuid not null references profiles(id) on delete cascade,
  campaign_enrollment_id uuid,           -- set once campaigns exist (0006); nullable fk added there
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index claim_tokens_profile_idx on claim_tokens(profile_id);

alter table claim_tokens enable row level security;
-- Also service-role only: validated exclusively by the claim-start Route Handler
-- via the server-side Supabase client, never queried from the browser.
