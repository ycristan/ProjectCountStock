-- 023_solo_counter_rls_hardening.sql
-- Follow-up to 022_solo_counter_fixed.sql: closes RLS gaps found in code review.
-- Does not touch 022 (migrations are immutable once applied in this repo).

-- 1. solo_sessions_counter_update had no explicit WITH CHECK. Postgres reuses
--    USING implicitly, which already blocks a counter from un-assigning
--    themselves (assigned_to_counter must stay true), but nothing constrained
--    restrict_to_list -- a counter could flip it via UPDATE.
--
--    Postgres CHECK/RLS clauses cannot compare against the OLD row's other
--    columns, so we can't pin restrict_to_list's value in a policy. Instead,
--    narrow via column-level privileges: revoke blanket UPDATE on
--    solo_sessions from authenticated and grant UPDATE only on the single
--    column the counter role is actually meant to write.
--
--    counter_name is set by the counter themself (see 018_solo_pin below).
--    In the current app this write path (definirNomeContadorSolo) always
--    uses the service-role client, so this grant is defense-in-depth rather
--    than live-path-critical -- but it's cheap and closes a real gap, so we
--    do it properly rather than relying on the app layer alone.
REVOKE UPDATE ON solo_sessions FROM authenticated;
GRANT UPDATE (counter_name) ON solo_sessions TO authenticated;

-- Add an explicit WITH CHECK mirroring USING, so the "no self-unassignment"
-- invariant is self-documenting instead of relying on implicit Postgres
-- behavior (USING is reused as WITH CHECK when the latter is omitted).
DROP POLICY solo_sessions_counter_update ON solo_sessions;
CREATE POLICY solo_sessions_counter_update ON solo_sessions
  FOR UPDATE USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  );

-- 2. Naming consistency: both are FOR SELECT policies; the sibling policy on
--    solo_sessions already uses the _select suffix (solo_sessions_counter_select).
DROP POLICY solo_session_items_counter_read ON solo_session_items;
CREATE POLICY solo_session_items_counter_select ON solo_session_items
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_session_items.session_id AND s.assigned_to_counter = true
    )
  );

-- 3a. restrict_to_list is intentionally NOT enforced in RLS on solo_entries
--     writes. Enforcement happens at the application layer instead: a
--     forthcoming lancarSoloContagemCounter server action checks
--     solo_session_items membership before writing, using the service-role
--     client. This matches the pattern already used throughout this codebase
--     -- RLS scopes role/ownership, business-rule validation lives in server
--     actions (see e.g. the bpu / negative-value checks in actions/contagem.ts).
--     Business rules like list restriction are never encoded in RLS here.
--     This is a deliberate design choice, not an oversight.

-- 3b. The comment in 022_solo_counter_fixed.sql referencing "018_solo_pin"
--     points at a migration file that does not exist in this repo. That
--     migration WAS applied to the live database (confirmed via
--     mcp__claude_ai_Supabase__list_migrations, project sktpzvlmeegyuqsvtunx:
--     version 20260702135320, name "018_solo_pin") and the counter_name
--     column it added genuinely exists on solo_sessions. Its .sql file was
--     simply never committed to this repo -- it predates this feature and is
--     an unrelated pre-existing gap, likely left over from the abandoned PR
--     #47 work. Do not attempt to reconstruct the missing file; this note
--     exists so the discrepancy isn't mistaken for something broken by this
--     migration or 022.
