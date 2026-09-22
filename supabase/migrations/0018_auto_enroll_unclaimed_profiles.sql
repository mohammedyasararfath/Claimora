-- Nothing in the codebase ever created a campaign_enrollments row — only
-- email-sequence-tick (advances due enrollments) and stop_campaigns_on_claim
-- (0011, freezes one on claim) touch that table. So an unclaimed profile was
-- never actually enrolled in the claim-email sequence, and the admin "claim
-- email journey" panel (app/api/admin/profiles/[id]/email-journey) always
-- had nothing to show. This is the missing, symmetric "start" half.
create or replace function enroll_unclaimed_profile()
returns trigger
language plpgsql
as $$
declare
  v_campaign_id uuid;
begin
  if new.status = 'unclaimed' and (tg_op = 'INSERT' or old.status <> 'unclaimed') then
    select id into v_campaign_id from campaigns where kind = 'claim_sequence' and active limit 1;
    if v_campaign_id is not null then
      insert into campaign_enrollments (campaign_id, profile_id, next_scheduled_at)
      values (v_campaign_id, new.id, now())
      on conflict (campaign_id, profile_id) do update
        set stopped_reason = null, emails_sent = 0, next_scheduled_at = now()
        where campaign_enrollments.stopped_reason is not null;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_enroll_unclaimed
  after insert or update on profiles
  for each row execute function enroll_unclaimed_profile();

-- Backfill: enroll every currently-unclaimed profile that predates this
-- trigger (a no-op UPDATE still fires it).
update profiles set status = 'unclaimed' where status = 'unclaimed';
