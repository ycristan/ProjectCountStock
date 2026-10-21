begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table provision_case(session_id uuid default gen_random_uuid(), admin_id uuid default gen_random_uuid(), other_id uuid default gen_random_uuid(), draft jsonb, plan jsonb, job jsonb);
insert into provision_case default values;
insert into auth.users(id,email,raw_user_meta_data) select admin_id,admin_id||'@example.invalid','{}'::jsonb from provision_case
union all select other_id,other_id||'@example.invalid','{"role":"admin"}'::jsonb from provision_case;
insert into public.app_user_access(user_id,access_kind) select admin_id,'admin' from provision_case;
insert into public.count_sessions(id) select session_id from provision_case;
update provision_case set draft=jsonb_build_array(jsonb_build_object('name','Test team','members',jsonb_build_array(
  jsonb_build_object('name','First','role','counter'),jsonb_build_object('name','Second','role','counter'),jsonb_build_object('name','Independent','role','independent'))));
update provision_case set plan=jsonb_build_array((draft->0)||jsonb_build_object('pin',(floor(random()*9000)+1000)::integer::text,
 'members',(select jsonb_agg(m||jsonb_build_object('pin',lpad(n::text,4,'0'),'userId',gen_random_uuid())) from jsonb_array_elements(draft->0->'members') with ordinality as x(m,n))));
select ok(not has_table_privilege('authenticated','private.team_setup_jobs','SELECT'),'Operational PIN plan is not directly readable');
select ok(not has_table_privilege('service_role','private.team_setup_jobs','UPDATE'),'Service role cannot rewrite the plan');
select ok(not has_function_privilege('anon','public.read_team_setup(uuid)','EXECUTE'),'Anonymous cannot read setup');
select ok(not has_function_privilege('service_role','public.complete_team_setup(uuid)','EXECUTE'),'Service key alone cannot finalize');
select ok(not has_function_privilege('authenticated','private.build_team_setup(uuid,uuid,text,text,jsonb)','EXECUTE'),'Builder remains inaccessible');

select set_config('request.jwt.claim.sub',(select other_id::text from provision_case),true);
select throws_ok($q$select public.read_team_setup(session_id) from provision_case$q$,'42501','Not authorized','Forged user metadata cannot read plans');
select throws_ok($q$select public.reserve_team_setup(session_id,draft,plan) from provision_case$q$,'42501','Not authorized','Forged user metadata cannot reserve');
select throws_ok($q$select public.complete_team_setup(session_id) from provision_case$q$,'42501','Not authorized','Forged user metadata cannot complete');
select set_config('request.jwt.claim.sub',(select admin_id::text from provision_case),true);
select is((select public.read_team_setup(session_id) from provision_case),null::jsonb,'No existing setup is distinguishable from failure');
select throws_ok($q$select public.reserve_team_setup(session_id,draft,'{}') from provision_case$q$,'P0001','Invalid setup plan','Reject non-array plan');
select throws_ok($q$select public.reserve_team_setup(session_id,draft,jsonb_set(plan,'{0,members,0,role}','"independent"')) from provision_case$q$,'P0001','Distinct PINs and one independent required','Reject multiple independents');
select lives_ok($q$update provision_case set job=public.reserve_team_setup(session_id,draft,plan)$q$,'Protected admin reserves one job');
select is((select count(*) from private.team_setup_jobs),1::bigint,'Exactly one operation');
select is((select count(*) from public.teams t join provision_case c on c.session_id=t.session_id),0::bigint,'Reservation does not publish a partial team');
select ok((select not (job->>'complete')::boolean from provision_case),'Pending state is explicit');
select ok((select bool_and(m->>'userId' is null) from provision_case c cross join lateral jsonb_array_elements(c.job->'plan'->0->'members') m),'Client supplied Auth IDs ignored');
select is((select public.reserve_team_setup(session_id,draft,'[]')->>'id' from provision_case),(select job->>'id' from provision_case),'Retry returns same operation without new PINs');
select throws_ok($q$select public.reserve_team_setup(session_id,'[]',plan) from provision_case$q$,'P0001','Resume the saved team setup before changing its names','Changed draft cannot overwrite saved plan');
select throws_ok($q$select public.complete_team_setup(session_id) from provision_case$q$,'P0001','Login provisioning is incomplete; retry the saved setup','No publish before Auth provisioning');
select throws_ok($q$insert into public.teams(session_id,team_name,team_pin) select session_id,'Collision',plan->0->>'pin' from provision_case$q$,'P0001','Team PIN is reserved by another setup','Legacy insert cannot steal reserved PIN');
select throws_ok($q$insert into public.teams(session_id,team_name,team_pin) select session_id,'Mixed legacy',lpad(((plan->0->>'pin')::integer+1)::text,4,'0') from provision_case$q$,'P0001','Team PIN is reserved by another setup','Legacy team cannot enter a session reserved for new setup');
-- Owned confirmed Auth fixtures, not a claim of real provisioning (covered in Chromium).
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select gen_random_uuid(),(c.plan->0->>'pin')||(m->>'pin')||'@count.local',now(),jsonb_build_object('team_setup_job',c.job->>'id')
from provision_case c cross join lateral jsonb_array_elements(c.plan->0->'members') m;
update auth.users set raw_app_meta_data='{}',raw_user_meta_data=jsonb_build_object('team_setup_job',c.job->>'id')
from provision_case c where auth.users.email=(c.plan->0->>'pin')||(c.plan->0->'members'->0->>'pin')||'@count.local';
select throws_ok($q$select public.complete_team_setup(session_id) from provision_case$q$,'P0001','Login provisioning is incomplete; retry the saved setup','Editable metadata cannot claim provisioning ownership');
update auth.users set raw_app_meta_data=jsonb_build_object('team_setup_job',c.job->>'id'),email_confirmed_at=null
from provision_case c where auth.users.email=(c.plan->0->>'pin')||(c.plan->0->'members'->0->>'pin')||'@count.local';
select throws_ok($q$select public.complete_team_setup(session_id) from provision_case$q$,'P0001','Login provisioning is incomplete; retry the saved setup','Unconfirmed identity cannot be published');
update auth.users set email_confirmed_at=now() from provision_case c
where auth.users.email=(c.plan->0->>'pin')||(c.plan->0->'members'->0->>'pin')||'@count.local';
select lives_ok($q$update provision_case set job=public.complete_team_setup(session_id)$q$,'Publish checked memberships transactionally');
select ok((select (job->>'complete')::boolean from provision_case),'Completion stored');
select is((select count(*) from public.teams t join provision_case c on c.session_id=t.session_id),1::bigint,'Only one team published');
select is((select count(*) from public.team_memberships m join public.teams t on t.id=m.team_id join provision_case c on c.session_id=t.session_id),3::bigint,'All three memberships published');
select is((select f.phase from public.team_flows f join public.teams t on t.id=f.team_id join provision_case c on c.session_id=t.session_id),'setup','No premature counting activation');
select is((select public.complete_team_setup(session_id) from provision_case),(select job from provision_case),'Completion retry is identical');
select is((select count(*) from private.team_setup_receipts),1::bigint,'Retry does not duplicate receipt');
select ok((select bool_and(not (plan::text like '%userId%')) from private.team_setup_jobs),'Operational stored plan has no client-controlled identity');
select * from finish();
rollback;
