-- PR #12: track when each counter marks themselves as done
ALTER TABLE counter_accounts ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
