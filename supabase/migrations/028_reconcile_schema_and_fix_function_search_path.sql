-- Production has this legacy 4-character PIN column, but its original migration
-- was never committed. Keep fresh databases structurally compatible.
ALTER TABLE public.counter_accounts
  ADD COLUMN IF NOT EXISTS user_pin character(4);

-- These privileged legacy functions resolve public tables without a fixed
-- search path. Keep their existing behavior while making that lookup explicit.
ALTER FUNCTION public.convert_count(integer, integer, integer, integer, integer)
  SET search_path TO pg_catalog, public, pg_temp;

ALTER FUNCTION public.finalize_team_count(uuid)
  SET search_path TO pg_catalog, public, pg_temp;

ALTER FUNCTION public.combine_session_results(uuid)
  SET search_path TO pg_catalog, public, pg_temp;
