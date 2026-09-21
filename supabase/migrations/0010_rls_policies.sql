-- ============================================================================
-- Row Level Security policies
--
-- Convention: default-deny. Every policy below is additive; a table with RLS
-- enabled (0002-0009) and no matching policy for an operation denies it for
-- every role except the service-role key (which bypasses RLS entirely and is
-- used only inside Edge Functions / trusted server code, never in the browser).
-- ============================================================================

-- app_users --------------------------------------------------------------

create policy "self read" on app_users for select
  using (id = auth.uid() or is_staff());

create policy "self update own name" on app_users for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from app_users where id = auth.uid()));
-- role can never be changed by the user themselves (no with-check branch permits it);
-- role changes are an admin-only, service-role operation.

-- profiles -----------------------------------------------------------------

create policy "public read" on profiles for select using (true);
-- search/results must stay publicly browsable, matching the prototype's open search.

create policy "owner update non-status fields" on profiles for update
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and status = (select status from profiles where id = profiles.id)
    and srs = (select srs from profiles where id = profiles.id)
  );
-- an owner can edit their own profile's descriptive fields but can never move
-- status ('claimed' -> 'pro') or srs themselves; only security-definer functions
-- invoked by the claim-confirm endpoint and the Stripe webhook may do that.

create policy "admin full access" on profiles for all using (is_admin()) with check (is_admin());

create policy "field locks read" on profile_field_locks for select using (true);
create policy "field locks admin write" on profile_field_locks for all using (is_admin()) with check (is_admin());

-- chat_sessions --------------------------------------------------------------

create policy "participant read" on chat_sessions for select using (
  visitor_user_id = auth.uid()
  or (select owner_user_id from profiles where id = chat_sessions.profile_id) = auth.uid()
  or is_staff()
);

create policy "participant update own session" on chat_sessions for update
  using (visitor_user_id = auth.uid() or is_staff())
  with check (visitor_user_id = auth.uid() or is_staff());

-- Inserts for anonymous (pre-auth) visitors happen exclusively through the
-- /api/claim/start Route Handler using the service-role key (so the signed
-- anon_token can be minted server-side); authenticated visitors may create
-- their own sessions directly.
create policy "authenticated create own session" on chat_sessions for insert
  with check (visitor_user_id = auth.uid());

-- chat_messages ----------------------------------------------------------------

create policy "session participant read messages" on chat_messages for select using (
  exists (
    select 1 from chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.visitor_user_id = auth.uid() or is_staff())
  )
);

create policy "session participant send messages" on chat_messages for insert with check (
  exists (
    select 1 from chat_sessions cs
    where cs.id = chat_messages.session_id
      and (cs.visitor_user_id = auth.uid() or is_staff())
  )
);

create policy "graph reads staff+owner read" on chat_graph_reads for select using (
  exists (
    select 1 from chat_sessions cs
    where cs.id = chat_graph_reads.session_id
      and (cs.visitor_user_id = auth.uid() or is_staff())
  )
);

create policy "open questions staff+owner read" on chat_open_questions for select using (
  exists (
    select 1 from chat_sessions cs
    where cs.id = chat_open_questions.session_id
      and (cs.visitor_user_id = auth.uid() or is_staff())
  )
);

-- live_agent_requests ------------------------------------------------------

create policy "requester read own" on live_agent_requests for select using (
  is_staff()
  or exists (
    select 1 from chat_sessions cs
    where cs.id = live_agent_requests.session_id and cs.visitor_user_id = auth.uid()
  )
);

create policy "staff manage queue" on live_agent_requests for all
  using (is_staff()) with check (is_staff());

create policy "authenticated create own request" on live_agent_requests for insert with check (
  is_staff()
  or exists (
    select 1 from chat_sessions cs
    where cs.id = live_agent_requests.session_id and cs.visitor_user_id = auth.uid()
  )
);

create policy "staff only requirements" on live_agent_requirements for all
  using (is_staff()) with check (is_staff());

create policy "staff only notes" on live_agent_notes for all
  using (is_staff()) with check (is_staff());
-- Notes are explicitly never readable by the visitor, matching the prototype's
-- "never shown to visitor" note field.

create policy "staff only field edits read" on live_agent_field_edits for select using (is_staff());
create policy "staff only field edits write" on live_agent_field_edits for insert with check (is_staff());

create policy "presence self write" on agent_presence for all
  using (agent_user_id = auth.uid() or is_admin())
  with check (agent_user_id = auth.uid() or is_admin());
create policy "presence staff read" on agent_presence for select using (is_staff());

-- campaigns / email / sms ---------------------------------------------------

create policy "admin manage campaigns" on campaigns for all using (is_admin()) with check (is_admin());
create policy "staff read campaigns" on campaigns for select using (is_staff());

create policy "admin manage enrollments" on campaign_enrollments for all using (is_admin()) with check (is_admin());

create policy "admin read email events" on email_events for select using (is_admin());
-- writes are service-role only (Edge Functions), no insert/update policy for any client role.

create policy "admin read sms events" on sms_events for select using (is_admin());

create policy "admin manage suppressions" on email_suppressions for all using (is_admin()) with check (is_admin());

-- billing --------------------------------------------------------------------

create policy "public read packages" on packages for select using (true);
create policy "admin manage packages" on packages for all using (is_admin()) with check (is_admin());

create policy "public read addons" on addons for select using (true);
create policy "admin manage addons" on addons for all using (is_admin()) with check (is_admin());

create policy "public read active promos" on promo_codes for select using (active = true);
create policy "admin manage promos" on promo_codes for all using (is_admin()) with check (is_admin());

create policy "owner read own subscription" on subscriptions for select using (
  owner_user_id = auth.uid() or is_staff()
);
-- all writes to subscriptions are service-role only (stripe-webhook Edge Function);
-- no client-facing insert/update/delete policy exists on purpose.

create policy "owner or staff read payments" on payments for select using (
  is_staff()
  or exists (select 1 from subscriptions s where s.id = payments.subscription_id and s.owner_user_id = auth.uid())
);
-- writes are service-role only (stripe-webhook), same reasoning as subscriptions.

-- stripe_webhook_events: service-role only, no client policy at all (idempotency ledger).

-- analytics / audit -----------------------------------------------------------

create policy "staff read agent events" on agent_events for select using (is_staff());
-- writes happen from trusted server code (Edge Functions / Route Handlers using
-- the server client under RLS as the authenticated staff/service context).
create policy "staff write agent events" on agent_events for insert with check (true);

create policy "admin read audit log" on admin_audit_log for select using (is_admin());
-- inserts come only from security-definer functions / service-role code paths.

create policy "admin read evals" on eval_runs for select using (is_admin());
create policy "admin read eval incidents" on eval_incidents for select using (is_admin());

-- knowledge base -----------------------------------------------------------

create policy "staff read knowledge" on knowledge_chunks for select using (is_staff());
-- the ai-agent-turn Edge Function reads this via the service-role key when
-- answering an anonymous visitor, so anonymous chat is never blocked by this
-- policy; it exists to keep the raw KB unreadable from the browser client.
create policy "admin manage knowledge" on knowledge_chunks for all using (is_admin()) with check (is_admin());
