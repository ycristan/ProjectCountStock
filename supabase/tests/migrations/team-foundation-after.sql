do $$
declare original record; actual jsonb; added text;
begin
  for original in select * from team_upgrade_probe.snapshots loop
    -- count_sessions.title (added 24/11, optional, null for every old session) is the only new field.
    added:=case when original.schema_name='public' and original.table_name='count_sessions' then 'title' else '' end;
    execute format('select jsonb_agg(to_jsonb(t)-%L order by (to_jsonb(t)-%L)::text) from %I.%I t',added,added,original.schema_name,original.table_name) into actual;
    if actual is distinct from original.content then raise exception 'Historical fields changed in %.%',original.schema_name,original.table_name; end if;
  end loop;
  if exists (select 1 from public.team_flows) or exists (select 1 from public.team_memberships) then
    raise exception 'Foundation silently activated legacy teams';
  end if;
  raise notice 'PASS: all pre-existing public tables and Auth users unchanged; no active/closed legacy team converted';
end;
$$;
drop schema team_upgrade_probe cascade;
