-- chat_sessions.visitor_user_id gets bound at claim-start time to whichever
-- account (if any) is already logged into the browser — see
-- app/api/claim/start/route.ts. That's necessary plumbing for an
-- already-signed-in visitor's own claim chat to authorize its API calls, but
-- it happens BEFORE OTP verification and has no relationship to which
-- contact actually gets verified. confirm_claim previously trusted a
-- visitor_user_id match as sufficient proof of "this is the verified
-- person" — but that only reflects who was logged in when the session
-- started, not who passed verification. A different account signed into the
-- same browser (or one that happens to share cookies, e.g. staff testing)
-- could click "Confirm & finish" on someone else's human-resolved claim and
-- take ownership of a profile that was verified for a completely different
-- email. This adds a second, independent check: when the session has a real
-- verified contact (pre_verified is an object with a "contact" key — the
-- normal OTP path, not the restricted/manual-review string), the confirming
-- account's own email or phone must actually match it.
create or replace function confirm_claim(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session chat_sessions;
  v_verified_contact text;
  v_account_matches boolean;
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

  if jsonb_typeof(v_session.pre_verified) = 'object' and v_session.pre_verified ? 'contact' then
    v_verified_contact := lower(v_session.pre_verified ->> 'contact');
    select exists (
      select 1 from auth.users
      where id = auth.uid()
        and (lower(email) = v_verified_contact or lower(coalesce(phone, '')) = v_verified_contact)
    ) into v_account_matches;

    if not v_account_matches then
      raise exception 'the verified contact for this claim does not match your signed-in account';
    end if;
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
