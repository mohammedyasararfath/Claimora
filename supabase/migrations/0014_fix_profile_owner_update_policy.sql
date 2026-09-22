-- The original "owner update non-status fields" policy (0010) wrote
-- `(select status from profiles where id = profiles.id)` intending to
-- compare the incoming row against its own current stored value. But
-- `profiles.id` inside that subquery doesn't correlate to the row being
-- checked — RLS policy expressions have no NEW/OLD pseudo-table, so bare
-- table-qualified references just re-open the same table unaliased. The
-- subquery's own FROM clause introduces "profiles" as the innermost scope,
-- so `profiles.id` resolves to *that* scan's id, making the WHERE clause
-- degenerate to `id = id` — always true, matching every row — so the
-- subquery returns one row per profile instead of one. On any table with
-- more than one row this raises "more than one row returned by a subquery
-- used as an expression" (Postgres error 21000), which is exactly what
-- happened the first time this policy was actually exercised (the new
-- dashboard profile-edit page). The correlated column needs to be the bare,
-- unqualified `id` — which *does* refer to the row being checked — compared
-- against an explicitly aliased inner scan.
drop policy "owner update non-status fields" on profiles;

create policy "owner update non-status fields" on profiles for update
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    and status = (select p.status from profiles p where p.id = id)
    and srs = (select p.srs from profiles p where p.id = id)
  );
