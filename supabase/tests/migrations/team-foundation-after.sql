do $$
declare original record; actual jsonb;
begin
  for original in select * from team_upgrade_probe.snapshots loop
    execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from %I.%I t',original.schema_name,original.table_name) into actual;
    if actual is distinct from original.content then raise exception 'Historical fields changed in %.%',original.schema_name,original.table_name; end if;
  end loop;
  if exists (select 1 from public.team_flows) or exists (select 1 from public.team_memberships) then
    raise exception 'Foundation silently activated legacy teams';
  end if;
  raise notice 'PASS: all pre-existing public tables and Auth users unchanged; no active/closed legacy team converted';
end;
$$;
drop schema team_upgrade_probe cascade;
