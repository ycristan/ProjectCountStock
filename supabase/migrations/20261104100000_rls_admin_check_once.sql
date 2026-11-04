-- Performance only: who can read or write does not change.
-- A bare is_admin() in a policy runs once per row (2,310 rows = 2,310 lookups,
-- ~800 ms per 1,000-row page measured on 2026-11-04). Wrapped in (select ...),
-- Postgres runs it once per query (~3.5 ms for the same page).

alter policy admin_all on public.inventory_items
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.item_bin_locations
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.count_sessions
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.teams
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.counter_accounts
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.count_entries
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.reconciliation_items
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.combined_results
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy admin_all on public.audit_approvals
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy team_session_result_admin_read on public.team_session_results
  using ((select private.is_admin()));
alter policy team_session_result_admin_read on public.team_session_result_items
  using ((select private.is_admin()));

alter policy counter_read_own on public.counter_accounts
  using (auth_user_id = (select auth.uid()));
