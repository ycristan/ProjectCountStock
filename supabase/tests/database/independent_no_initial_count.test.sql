begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Dados sintéticos; transação desfeita no fim. Contas sem papel no metadata,
-- como as criadas depois da PR #63.
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000a01','indep-c1@example.invalid','{}'),
('00000000-0000-0000-0000-000000000a02','indep-ind@example.invalid','{}'),
('00000000-0000-0000-0000-000000000a03','indep-admin@example.invalid','{}');
insert into public.app_user_access(user_id,access_kind) values
('00000000-0000-0000-0000-000000000a01','team_counter'),
('00000000-0000-0000-0000-000000000a02','team_counter'),
('00000000-0000-0000-0000-000000000a03','admin');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,brand_active,warehouse_id) values
('indep-item','Synthetic product',1,0,true,(select id from public.warehouses where name='Main'));
insert into public.count_sessions(id,warehouse_id) values
('00000000-0000-0000-0000-000000000a11',(select id from public.warehouses where name='Main'));
insert into public.teams(id,session_id,team_name) values
('00000000-0000-0000-0000-000000000a12','00000000-0000-0000-0000-000000000a11','Independent test team');
insert into public.counter_accounts(auth_user_id,team_id,role,username) values
('00000000-0000-0000-0000-000000000a01','00000000-0000-0000-0000-000000000a12','contador_1','indep-c1'),
('00000000-0000-0000-0000-000000000a02','00000000-0000-0000-0000-000000000a12','independente','indep-ind');

set local role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000a01',true);
select lives_ok($$insert into public.count_entries(team_id,counter_role,brand_code,units,final_cases,final_units)
values ('00000000-0000-0000-0000-000000000a12','contador_1','indep-item',2,2,0)$$,
'Counter 1 without metadata role can still enter an initial count');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000a02',true);
select throws_ok($$insert into public.count_entries(team_id,counter_role,brand_code,units,final_cases,final_units)
values ('00000000-0000-0000-0000-000000000a12','independente','indep-item',3,3,0)$$,
'42501',null,'Independent cannot insert an initial count through the Data API');
select is((select count(*) from public.count_entries where team_id='00000000-0000-0000-0000-000000000a12'),1::bigint,
'Independent still reads the team counts for monitoring');
update public.count_entries set units=9 where team_id='00000000-0000-0000-0000-000000000a12';
delete from public.count_entries where team_id='00000000-0000-0000-0000-000000000a12';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000a01',true);
select results_eq($$select units from public.count_entries where team_id='00000000-0000-0000-0000-000000000a12'$$,
$$values (2)$$,'Independent cannot update or delete counter entries');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000a03',true);
select lives_ok($$update public.count_entries set units=4 where team_id='00000000-0000-0000-0000-000000000a12'$$,
'Protected admin keeps write access');
select is((select units from public.count_entries where team_id='00000000-0000-0000-0000-000000000a12'),4,
'Admin update applied');

select * from finish();
rollback;
