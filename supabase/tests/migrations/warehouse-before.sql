-- Synthetic data for the disposable CI database, before warehouse columns exist.
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,category,category1)
values ('migration-probe-a','Historical product',20,80,330,'Drinks','Cans');
insert into public.item_bin_locations(brand_code,bin_location) values('migration-probe-a','40B');
insert into public.count_sessions(id,status) values('00000000-0000-0000-0000-000000000901','fechada');
insert into public.teams(id,session_id,team_name,status)
values('00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000901','Historical team','reconciliada');
insert into public.count_entries(team_id,counter_role,brand_code,cases,final_cases)
values('00000000-0000-0000-0000-000000000902','contador_1','migration-probe-a',20,20);
insert into public.combined_results(session_id,brand_code,total_cases,status)
values('00000000-0000-0000-0000-000000000901','migration-probe-a',20,'Avl');
insert into public.solo_sessions(id,title,restrict_to_list)
values('00000000-0000-0000-0000-000000000903','Historical closed solo',true);
insert into public.solo_session_items(session_id,brand_code)
values('00000000-0000-0000-0000-000000000903','migration-probe-a');
insert into public.solo_entries(session_id,brand_code,brand_name,cases,final_cases)
values('00000000-0000-0000-0000-000000000903','migration-probe-a','Historical product',20,20);
update public.solo_sessions set status='closed' where id='00000000-0000-0000-0000-000000000903';

create schema migration_probe;
create table migration_probe.snapshots(name text primary key, content jsonb);
do $$
declare tab text; snapshot jsonb;
begin
 foreach tab in array array['inventory_items','item_bin_locations','count_sessions','teams',
 'count_entries','combined_results','solo_sessions','solo_entries','solo_session_items'] loop
   execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.%I t',tab) into snapshot;
   insert into migration_probe.snapshots values(tab,snapshot);
 end loop;
end;
$$;
