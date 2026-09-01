-- 018_solo_pin.sql
-- Historical migration applied to production on 2026-07-02 but not committed
-- at the time. Reintroduced here so a fresh database can replay the complete
-- schema history. Production already has this column.
ALTER TABLE public.solo_sessions
  ADD COLUMN IF NOT EXISTS counter_name text;
