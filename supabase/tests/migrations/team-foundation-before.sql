-- Disposable upgrade fixture: open + closed legacy teams and their identity rows.
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-0000-0000-000000000001','upgrade@example.invalid','{"full_name":"Synthetic legacy participant"}');
insert into public.count_sessions(id) values('20000000-0000-0000-0000-000000000002');
insert into public.teams(id,session_id,team_name)
values('20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','Open legacy team');
insert into public.counter_accounts(auth_user_id,team_id,role,username)
values('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','contador_1','upgrade-synthetic');
insert into public.count_entries(team_id,counter_role,brand_code,cases,final_cases)
values('20000000-0000-0000-0000-000000000003','contador_1','migration-probe-a',2,2);
create schema team_upgrade_probe;
create table team_upgrade_probe.snapshots(schema_name text,table_name text,content jsonb);
do $$
declare tab record; snapshot jsonb;
begin
  for tab in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='auth' and tablename='users') loop
    execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from %I.%I t',tab.schemaname,tab.tablename) into snapshot;
    insert into team_upgrade_probe.snapshots values(tab.schemaname,tab.tablename,snapshot);
  end loop;
end;
$$;
