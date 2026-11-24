begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. The Auditor is a read-only observer of ONE session's live count
-- (DECISOES.md, 24/11): reads three functions, writes nothing, ends on revoke or session close.
insert into auth.users(id,email) select ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'auditor-'||n||'@example.invalid' from generate_series(1,6) n;
-- 1,2 counters of team A; 3 independent; 4 admin; 5 auditor of session 100; 6 auditor of session 101
insert into public.app_user_access(user_id,access_kind) values
('40000000-0000-0000-0000-000000000004','admin'),
('40000000-0000-0000-0000-000000000005','auditor'),
('40000000-0000-0000-0000-000000000006','auditor');
insert into public.warehouses(id,name) values('40000000-0000-0000-0000-000000000900','Auditor WH');
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size,weight_avg,warehouse_id,brand_active) values
('aud-a1','Aud A1',10,5,100,'40000000-0000-0000-0000-000000000900',true),
('aud-a2','Aud A2',1,0,0,'40000000-0000-0000-0000-000000000900',true);
insert into public.count_sessions(id,warehouse_id,box_tare_g) values
('40000000-0000-0000-0000-000000000100','40000000-0000-0000-0000-000000000900',250),
('40000000-0000-0000-0000-000000000101','40000000-0000-0000-0000-000000000900',250);
insert into public.teams(id,session_id,team_name) values
('40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000100','Team A'),
('40000000-0000-0000-0000-000000000201','40000000-0000-0000-0000-000000000101','Team B');
insert into public.team_flows(team_id) values('40000000-0000-0000-0000-000000000200'),('40000000-0000-0000-0000-000000000201');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('40000000-0000-0000-0000-000000000301','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000001','Counter A','counter',1),
('40000000-0000-0000-0000-000000000302','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000002','Counter B','counter',2),
('40000000-0000-0000-0000-000000000303','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('40000000-0000-0000-0000-000000000401','40000000-0000-0000-0000-000000000200',1),('40000000-0000-0000-0000-000000000402','40000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('40000000-0000-0000-0000-000000000501','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000401','40000000-0000-0000-0000-000000000301'),
('40000000-0000-0000-0000-000000000502','40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000402','40000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='40000000-0000-0000-0000-000000000200';
insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,cases,units,bpu_at_entry,method) values
('40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000501','40000000-0000-0000-0000-000000000401','aud-a1',2,3,10,'manual'),
('40000000-0000-0000-0000-000000000200','40000000-0000-0000-0000-000000000502','40000000-0000-0000-0000-000000000402','aud-a1',1,0,10,'manual');
insert into public.session_auditors(session_id,user_id,team_code,pin) values
('40000000-0000-0000-0000-000000000100','40000000-0000-0000-0000-000000000005','1111','2222'),
('40000000-0000-0000-0000-000000000101','40000000-0000-0000-0000-000000000006','3333','4444');

-- Fingerprint of every public table, to prove that nothing is written.
create function pg_temp.fingerprint() returns text language sql as $$
  select md5(string_agg(c.relname||md5(query_to_xml(format('select * from public.%I',c.relname),false,true,'')::text),',' order by c.relname))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' $$;
create temp table before_calls as select pg_temp.fingerprint() fp;

set local role anon;
select throws_ok($q$select public.read_team_count('40000000-0000-0000-0000-000000000200')$q$,'42501',null,'Anonymous cannot read the live count');
reset role;
set local role authenticated;

-- The Auditor of session 100.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000005',true);
select ok(public.is_auditor(),'The Auditor is recognised');
select is(public.read_auditor_teams(),'[{"id":"40000000-0000-0000-0000-000000000200","name":"Team A"}]'::jsonb,'Auditor lists only the teams of their own session');
select is(public.read_team_count('40000000-0000-0000-0000-000000000200')->>'role','auditor','Auditor reads the live count as Auditor');
select is(jsonb_array_length(public.read_team_count('40000000-0000-0000-0000-000000000200')->'records'),2,'Auditor sees every counter, like a monitor');
select is(jsonb_array_length(public.read_team_inventory('40000000-0000-0000-0000-000000000200')),2,'Auditor reads the inventory');
select lives_ok($q$select public.read_team_comparison('40000000-0000-0000-0000-000000000200')$q$,'Auditor reads the comparison');
select throws_ok($q$select public.read_team_count('40000000-0000-0000-0000-000000000201')$q$,'42501','Team access unavailable','Auditor cannot read a team of another session');
select throws_ok($q$select public.read_team_inventory('40000000-0000-0000-0000-000000000201')$q$,'42501','Team access unavailable','Auditor cannot read another session inventory');
select is((select count(*) from public.team_count_records),0::bigint,'Auditor has no direct read on count records');
select is((select count(*) from public.team_memberships),0::bigint,'Auditor has no direct read on memberships');
select throws_ok($q$select * from public.session_auditors$q$,'42501',null,'Nobody but the server reads the Auditor PINs');

-- Writes: call EVERY function the Auditor could execute with plausible arguments, then compare
-- the whole database. Anything that changed data fails here, including functions added later.
do $$
declare f record; args text;
begin
  for f in select p.oid, p.proname, p.proargtypes::oid[] types from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and has_function_privilege('authenticated',p.oid,'execute')
      and p.proname not like 'read\_%' and p.proname not in ('is_admin','is_solo_counter','is_auditor','my_team_id','my_counter_role') loop
    select coalesce(string_agg(case t::regtype::text
        when 'uuid' then quote_literal('40000000-0000-0000-0000-000000000200')||'::uuid'
        when 'text' then quote_literal('x')||'::text'
        when 'boolean' then 'false'
        when 'jsonb' then quote_literal('{}')||'::jsonb'
        when 'bigint' then '0::bigint' when 'integer' then '0::integer' when 'numeric' then '0::numeric'
        else 'null::'||t::regtype::text end, ',' order by o),'') into args
      from unnest(f.types) with ordinality as u(t,o);
    begin
      execute format('select public.%I(%s)',f.proname,args);
    exception when others then null;
    end;
  end loop;
end;
$$;
reset role;
select is((select pg_temp.fingerprint()),(select fp from before_calls),'No function changed any data when called as the Auditor');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000005',true);

-- Admin and counters keep behaving as before.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
select is(public.read_team_count('40000000-0000-0000-0000-000000000200')->>'role','admin','Admin still reads as admin');
select ok(not public.is_auditor(),'Admin is not an Auditor');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.read_team_count('40000000-0000-0000-0000-000000000200')->'records'),1,'A counter still sees only their own records');
select throws_ok($q$select public.read_auditor_teams()$q$,'42501','Auditor access unavailable','A counter is not an Auditor');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000006',true);
select throws_ok($q$select public.read_team_count('40000000-0000-0000-0000-000000000200')$q$,'42501','Team access unavailable','The Auditor of session B cannot read team A');

-- Revoked: loses access at once.
reset role;
update public.session_auditors set revoked_at=clock_timestamp() where session_id='40000000-0000-0000-0000-000000000100';
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000005',true);
select ok(not public.is_auditor(),'Revoked Auditor is no longer recognised');
select throws_ok($q$select public.read_team_count('40000000-0000-0000-0000-000000000200')$q$,'42501','Team access unavailable','Revoked Auditor cannot read the live count');

-- Session closed: the other Auditor loses access too.
reset role;
update public.count_sessions set status='fechada' where id='40000000-0000-0000-0000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000006',true);
select ok(not public.is_auditor(),'Auditor of a closed session is not recognised');
select throws_ok($q$select public.read_auditor_teams()$q$,'42501','Auditor access unavailable','Auditor of a closed session loses the screen');

select * from finish();
rollback;
