-- 0014 attempted to fix the "owner update non-status fields" policy's broken
-- self-referencing subquery, but the replacement (`where p.id = id`) hit the
-- exact same correlation problem in reverse — there is no clean way to
-- reference "this row's stored value before the update" from inside a WITH
-- CHECK subquery on the same table, because RLS policy expressions have no
-- OLD/NEW pseudo-table the way trigger functions do.
--
-- The robust fix is Postgres's native tool for "this role may update these
-- columns but not those": column-level privileges, enforced by the engine
-- itself, no custom comparison logic required. Supabase's default per-table
-- grant gave `authenticated` blanket UPDATE on every column (confirmed via
-- information_schema.column_privileges) — this narrows it so status/srs can
-- only ever change through a security-definer function (confirm_claim) or
-- the service-role client (stripe-webhook, the demo-upgrade route), both of
-- which run as the table owner and are unaffected by grants to `authenticated`.
drop policy "owner update non-status fields" on profiles;

create policy "owner update non-status fields" on profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

revoke update (status, srs) on profiles from authenticated;
