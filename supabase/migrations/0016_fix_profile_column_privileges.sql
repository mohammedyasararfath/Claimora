-- 0015's column-level REVOKE had no effect: the original grant to
-- `authenticated`/`anon` was table-wide (`GRANT UPDATE ON profiles TO ...`,
-- part of Supabase's default per-table grant), and a column-level REVOKE
-- can only remove a column-level sub-grant — it cannot carve an exception
-- out of a broader table-wide grant. Verified directly: after 0015,
-- information_schema.column_privileges still showed UPDATE on status/srs
-- for both roles, and an actual UPDATE of status/srs from an authenticated
-- session succeeded. The correct sequence is to revoke the table-wide
-- privilege first, then grant back only the columns that should be
-- editable — exactly mirroring the "owner update non-status fields" RLS
-- policy's original intent, this time enforced at a layer that can't have a
-- correlated-subquery bug.
revoke update on profiles from authenticated, anon;

grant update (name, category, city, brokerage, license, phone_e164, email, snippet)
  on profiles to authenticated;
