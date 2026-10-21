begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Internal builder tests, NOT Auth provisioning or an application/UI creation test.
create temp table setup_cases(
  size integer primary key, session_id uuid default gen_random_uuid(),
  command_id uuid default gen_random_uuid(), pin text, members jsonb, team_id uuid
);
create temp table setup_actors(id uuid default gen_random_uuid(), admin boolean);
insert into setup_actors(admin) values(true),(false);
insert into auth.users(id,email,raw_user_meta_data)
select id,id||'@example.invalid','{"role":"admin"}'::jsonb from setup_actors;
insert into public.app_user_access(user_id,access_kind) select id,'admin' from setup_actors where admin;
select set_config('request.jwt.claim.sub',(select id::text from setup_actors where admin),true);

do $$
declare n integer; j integer; uid uuid; c setup_cases; people jsonb; pin_value text;
begin
  for n in 3..6 loop
    loop
      pin_value:=(floor(random()*9000)+1000)::integer::text;
      exit when not exists(select 1 from setup_cases where pin=pin_value);
    end loop;
    insert into setup_cases(size,pin) values(n,pin_value) returning * into c;
    insert into public.count_sessions(id) values(c.session_id);
    people:='[]'::jsonb;
    for j in 1..n loop
      uid:=gen_random_uuid();
      insert into auth.users(id,email) values(uid,c.pin||lpad(j::text,4,'0')||'@count.local');
      people:=people||jsonb_build_array(jsonb_build_object('user_id',uid,
        'name',' Participant ','role',case when j=n then 'independent' else 'counter' end));
    end loop;
    update setup_cases set members=people where size=n;
  end loop;
end;
$$;

select lives_ok(format('update setup_cases set team_id=private.build_team_setup(session_id,command_id,%L,pin,members) where size=%s','Setup '||size,size),
  'T01 partial: atomic setup for '||size||' participants') from setup_cases where size<=5;
select is((select count(*) from public.team_memberships m where m.team_id=c.team_id),c.size::bigint,
  'All memberships persist for size '||c.size) from setup_cases c where size<=5;
select is((select count(*) from public.team_memberships m where m.team_id=c.team_id and role='independent'),1::bigint,
  'Exactly one independent for size '||c.size) from setup_cases c where size<=5;
select is((select count(*) from public.team_count_slots s where s.team_id=c.team_id),(c.size-1)::bigint,
  'N-1 counting positions for size '||c.size) from setup_cases c where size<=5;
select is((select count(*) from public.team_slot_assignments a where a.team_id=c.team_id),(c.size-1)::bigint,
  'Each counter assigned for size '||c.size) from setup_cases c where size<=5;
select is((select display_order from public.team_memberships m where m.team_id=c.team_id and role='independent'),0,
  'Independent first in display order for size '||c.size) from setup_cases c where size<=5;
select is((select phase from public.team_flows f where f.team_id=c.team_id),'setup',
  'Storage does not activate counting for size '||c.size) from setup_cases c where size<=5;
select is((select count(*) from public.team_slot_assignments a join public.team_memberships m on m.id=a.membership_id where m.role='independent'),0::bigint,'Independent has no initial counting position');
select is((select count(*) from public.counter_accounts a join setup_cases c on c.team_id=a.team_id),0::bigint,'No legacy accounts fabricated');
select is((select count(*) from public.app_user_access a join public.team_memberships m on m.user_id=a.user_id join setup_cases c on c.team_id=m.team_id),0::bigint,'No global application access issued');
select is((select count(*) from public.team_memberships m join setup_cases c on c.team_id=m.team_id where m.display_name='Participant'),12::bigint,'Names trimmed; equal names are allowed for distinct identities');
select is((select count(*) from private.team_setup_receipts),3::bigint,'One receipt per successful team');
select ok((select bool_and(t.session_id=c.session_id) from public.teams t join setup_cases c on c.team_id=t.id),'Teams retain selected session/warehouse scope');

select is(private.build_team_setup(session_id,command_id,'Setup '||size,pin,members),team_id,'Exact retry returns original team') from setup_cases where size<=5;
select is((select count(*) from private.team_setup_receipts),3::bigint,'Retry does not duplicate receipts');
select throws_ok($q$select private.build_team_setup(session_id,command_id,'Changed',pin,members) from setup_cases where size=3$q$,
  '22023','Setup identifier already used','Changed payload cannot reuse command ID');

select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,'[]') from setup_cases where size=6$q$,
  '22023','Invalid team members','Empty members rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,'{}') from setup_cases where size=6$q$,
  '22023','Invalid team setup','Non-array rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,members->0) from setup_cases where size=6$q$,
  '22023','Invalid team setup','Single object rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_build_array(members->0,members->1)) from setup_cases where size=6$q$,
  '22023','Invalid team members','Fewer than three people rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{5,role}','"counter"')) from setup_cases where size=6$q$,
  '22023','Team requires distinct people and one independent','Missing independent rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,role}','"independent"')) from setup_cases where size=6$q$,
  '22023','Team requires distinct people and one independent','Two independents rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,role}','"admin"')) from setup_cases where size=6$q$,
  '22023','Invalid team members','Arbitrary role rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,name}','"  "')) from setup_cases where size=6$q$,
  '22023','Invalid team members','Blank participant rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,user_id}',members#>'{1,user_id}')) from setup_cases where size=6$q$,
  '22023','Team requires distinct people and one independent','Duplicate identity rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,user_id}',to_jsonb(gen_random_uuid()))) from setup_cases where size=6$q$,
  'P0001','Team setup requires unused provisioned identities','Unknown identity rejected');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,jsonb_set(members,'{0,user_id}',(select to_jsonb(id) from setup_actors where admin))) from setup_cases where size=6$q$,
  'P0001','Team setup requires unused provisioned identities','Admin cannot become a new counter');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin,members) from setup_cases where size=3$q$,
  'P0001','Team setup requires unused provisioned identities','Existing memberships not repurposed');
select throws_ok($q$select private.build_team_setup(session_id,gen_random_uuid(),'Bad',pin||'0',members) from setup_cases where size=6$q$,
  '22023','Invalid team setup','Five-digit team PIN rejected');
select throws_ok($q$select private.build_team_setup(gen_random_uuid(),gen_random_uuid(),'Bad',pin,members) from setup_cases where size=6$q$,
  'P0001','Session is not open for team setup','Missing session rejected');

-- Failure after team/membership writes must roll back the whole statement.
create function pg_temp.reject_setup_assignment() returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.teams where id=new.team_id and team_name='Fail late') then
    raise exception 'Synthetic setup write failure';
  end if;
  return new;
end;
$$;
create trigger test_setup_failure before insert on public.team_slot_assignments
for each row execute function pg_temp.reject_setup_assignment();
select throws_ok($q$select private.build_team_setup(session_id,command_id,'Fail late',pin,members) from setup_cases where size=6$q$,
  'P0001','Synthetic setup write failure','Late failure is surfaced, not reported as success');
select is((select count(*) from public.teams where team_name='Fail late'),0::bigint,'Late failure leaves no partial team');
select is((select count(*) from public.team_memberships where user_id in(select (m->>'user_id')::uuid from setup_cases c,jsonb_array_elements(c.members) m where size=6)),0::bigint,'Late failure leaves no partial membership');
select is((select count(*) from private.team_setup_receipts),3::bigint,'Late failure leaves no success receipt');
drop trigger test_setup_failure on public.team_slot_assignments;

update public.count_sessions set status='fechada' where id=(select session_id from setup_cases where size=6);
select throws_ok($q$select private.build_team_setup(session_id,command_id,'Closed',pin,members) from setup_cases where size=6$q$,
  'P0001','Session is not open for team setup','Closed session cannot receive team');
select set_config('request.jwt.claim.sub',(select id::text from setup_actors where not admin),true);
select throws_ok($q$select private.build_team_setup(session_id,command_id,'Setup 3',pin,members) from setup_cases where size=3$q$,
  '42501','Team setup not authorized','Forged user metadata cannot authorize replay');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($q$select private.build_team_setup(null,null,null,null,null)$q$,
  '42501','Team setup not authorized','Missing actor rejected');
select ok(not has_function_privilege('authenticated','private.build_team_setup(uuid,uuid,text,text,jsonb)','EXECUTE'),'Builder not exposed to authenticated clients');
select ok(not has_function_privilege('anon','private.build_team_setup(uuid,uuid,text,text,jsonb)','EXECUTE'),'Builder not exposed to anonymous clients');
select ok(not has_function_privilege('service_role','private.build_team_setup(uuid,uuid,text,text,jsonb)','EXECUTE'),'Builder not exposed to service role');
select ok(not has_table_privilege('authenticated','private.team_setup_receipts','SELECT'),'Receipts hidden from clients');
select throws_ok($q$delete from private.team_setup_receipts$q$,'P0001','Team setup receipts are immutable','Receipt cleanup prohibited');
select throws_ok($q$update private.team_setup_receipts set created_at=now()$q$,'P0001','Team setup receipts are immutable','Receipt rewriting prohibited');
select * from finish();
rollback;
