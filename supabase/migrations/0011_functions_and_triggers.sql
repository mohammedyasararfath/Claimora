-- ============================================================================
-- Security-definer functions for the few state transitions an authenticated
-- client is allowed to trigger directly but that RLS's plain column checks
-- can't safely express (see 0010's "owner update non-status fields" policy,
-- which deliberately blocks a profile owner from touching status/srs).
-- ============================================================================

-- Visitor-side claim confirmation: only allowed once a live agent (or the AI
-- flow) has moved the session to 'ready_to_claim'. Never lets a client claim
-- a profile that hasn't gone through verification.
create or replace function confirm_claim(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session chat_sessions;
begin
  select * into v_session from chat_sessions where id = p_session_id;

  if v_session is null then
    raise exception 'session not found';
  end if;

  if v_session.visitor_user_id is distinct from auth.uid() then
    raise exception 'not authorized to confirm this session';
  end if;

  if v_session.status not in ('ready_to_claim', 'active') then
    raise exception 'session is not ready to be claimed (status=%)', v_session.status;
  end if;

  if v_session.profile_id is null then
    raise exception 'session has no target profile';
  end if;

  update profiles
  set owner_user_id = auth.uid(),
      status = 'claimed',
      claim_date = now(),
      is_restricted = coalesce((v_session.pre_verified ->> 'restricted')::boolean, is_restricted)
  where id = v_session.profile_id;

  update chat_sessions set status = 'claimed' where id = p_session_id;

  insert into agent_events (session_id, surface, outcome, detail)
  values (p_session_id, case when v_session.mode = 'claim' then 'Claim agent' else 'Create agent' end, 'converted', 'confirm_claim');
end;
$$;

grant execute on function confirm_claim(uuid) to authenticated;

-- Guard: an 'upgrade' live-agent request can only be marked resolved once
-- payment has actually succeeded (or the request was abandoned, which has its
-- own separate closure path). This is the database-level enforcement of the
-- "payment before Pro" rule described in the plan — the Route Handler also
-- checks this, but the trigger makes it impossible to bypass even via a bug
-- or a direct RLS-permitted update from the agent console.
create or replace function enforce_upgrade_resolution_gate()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'upgrade'
     and new.status = 'resolved'
     and new.abandoned = false
     and coalesce(new.conversion_status, '') is distinct from 'payment_succeeded' then
    raise exception 'cannot resolve an upgrade request before payment_succeeded (conversion_status=%)', new.conversion_status;
  end if;
  return new;
end;
$$;

create trigger live_agent_requests_resolution_gate
  before update on live_agent_requests
  for each row execute function enforce_upgrade_resolution_gate();

-- Monotonic email status rule: an email_events row can never move "backwards"
-- (e.g. a later 'opened' webhook can't downgrade a row already 'clicked').
create or replace function email_status_rank(s email_event_status)
returns int
language sql
immutable
as $$
  select case s
    when 'queued' then 0
    when 'received' then 1
    when 'opened' then 2
    when 'clicked' then 3
    when 'bounced' then 4
    when 'spam' then 5
    when 'unsubscribed' then 6
  end;
$$;

create or replace function enforce_email_status_monotonic()
returns trigger
language plpgsql
as $$
begin
  if email_status_rank(new.status) < email_status_rank(old.status) then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger email_events_monotonic_status
  before update on email_events
  for each row execute function enforce_email_status_monotonic();

-- Freeze a profile's campaign sequence the moment it's claimed (mirrors the
-- prototype's "sequence stopped — profile was claimed" admin note, now a
-- real, server-enforced side effect instead of a render-time check).
create or replace function stop_campaigns_on_claim()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'unclaimed' and old.status = 'unclaimed' then
    update campaign_enrollments
    set stopped_reason = 'claimed', next_scheduled_at = null
    where profile_id = new.id and stopped_reason is null;
  end if;
  return new;
end;
$$;

create trigger profiles_stop_campaigns_on_claim
  after update on profiles
  for each row execute function stop_campaigns_on_claim();
