-- 025_solo_counter_status_guard.sql
-- Follow-up to 022/023: counter-facing write policies checked assigned_to_counter
-- but never session status -- the same gap that caused incident #54 (6d719ab1,
-- "fix: encerrar sessao e revogar acesso apos combinacao final") on
-- count_entries/reconciliation_items. Currently non-exploitable (actions/solo.ts
-- already checks session.status !== 'open' before writing, and all counter writes
-- go through the service-role client, which bypasses RLS) -- this closes the
-- RLS-layer gap so it cannot silently regress if a future code path writes via
-- the user's own JWT instead. Found by /code-review on PR #58 (confidence 70/100).
-- Does not touch 022/023 (migrations are immutable once applied in this repo).

DROP POLICY solo_entries_counter ON solo_entries;
CREATE POLICY solo_entries_counter ON solo_entries
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_entries.session_id AND s.assigned_to_counter = true AND s.status = 'open'
    )
  );

DROP POLICY solo_sessions_counter_update ON solo_sessions;
CREATE POLICY solo_sessions_counter_update ON solo_sessions
  FOR UPDATE USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
    AND status = 'open'
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
    AND status = 'open'
  );
