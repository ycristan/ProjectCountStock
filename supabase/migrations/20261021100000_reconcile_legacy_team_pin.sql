-- Production already has this nullable character(4) column (read-only schema
-- inspection on 2026-09-21). Its original DDL was never committed.
-- Preserve existing values and constraints; repair fresh database replay only.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS team_pin character(4);
