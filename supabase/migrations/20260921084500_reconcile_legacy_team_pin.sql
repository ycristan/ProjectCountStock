-- Production already has this nullable character(4) column (read-only schema
-- inspection on 2026-09-21). Its original DDL was never committed.
-- Preserve existing values and constraints; repair fresh database replay only.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS team_pin character(4);

-- PR72 is still unpublished. Independent monitors and reconciles; never writes
-- initial count_entries, even through a direct Data API request. Keep SELECT
-- unchanged for monitoring and preserve all existing team/warehouse guards.
CREATE POLICY independent_no_initial_insert ON public.count_entries
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK ((select public.is_admin()) OR (select public.my_counter_role()) IN ('contador_1','contador_2'));
CREATE POLICY independent_no_initial_update ON public.count_entries
 AS RESTRICTIVE FOR UPDATE TO authenticated
 USING ((select public.is_admin()) OR (select public.my_counter_role()) IN ('contador_1','contador_2'))
 WITH CHECK ((select public.is_admin()) OR (select public.my_counter_role()) IN ('contador_1','contador_2'));
CREATE POLICY independent_no_initial_delete ON public.count_entries
 AS RESTRICTIVE FOR DELETE TO authenticated
 USING ((select public.is_admin()) OR (select public.my_counter_role()) IN ('contador_1','contador_2'));
