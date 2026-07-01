-- Add independente confirmation timestamp to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS independente_confirmed_at TIMESTAMPTZ;

-- Allow counters to read counter_accounts for their own team (needed for Realtime)
CREATE POLICY counter_read_team_accounts ON counter_accounts
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND team_id = ((auth.jwt()->'user_metadata'->>'team_id')::uuid)
  );
