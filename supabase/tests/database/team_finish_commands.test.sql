begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Synthetic fixtures only. Mutations under test use authenticated RPCs.
insert into auth.users(id,email,raw_user_meta_data)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'finish-'||n||'@example.invalid',
 case when n=5 then '{"role":"independent","is_admin":true}'::jsonb else '{}'::jsonb end
from generate_series(1,5) n;
insert into public.app_user_access(user_id,access_kind) values('20000000-0000-0000-0000-000000000004','admin');
insert into public.count_sessions(id) values('20000000-0000-0000-0000-000000000100');
insert into public.teams(id,session_id,team_name) values
('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000100','Finish A'),('20000000-0000-0000-0000-000000000201','20000000-0000-0000-0000-000000000100','Finish B');
insert into public.team_flows(team_id) values('20000000-0000-0000-0000-000000000200'),('20000000-0000-0000-0000-000000000201');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('20000000-0000-0000-0000-000000000301','20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000001','Counter A','counter',1),
('20000000-0000-0000-0000-000000000302','20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000002','Counter B','counter',2),
('20000000-0000-0000-0000-000000000303','20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000003','Independent','independent',0),
('20000000-0000-0000-0000-000000000313','20000000-0000-0000-0000-000000000201','20000000-0000-0000-0000-000000000003','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values
('20000000-0000-0000-0000-000000000401','20000000-0000-0000-0000-000000000200',1),('20000000-0000-0000-0000-000000000402','20000000-0000-0000-0000-000000000200',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('20000000-0000-0000-0000-000000000501','20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000401','20000000-0000-0000-0000-000000000301'),
('20000000-0000-0000-0000-000000000502','20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000402','20000000-0000-0000-0000-000000000302');
update public.team_flows set phase='counting',revision=1 where team_id='20000000-0000-0000-0000-000000000200';
set local role anon;
select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'42501',null,'Anonymous cannot request finish');

reset role;
set local role service_role;
select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'42501',null,'Service role cannot impersonate finish command');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'42501','Finish operation not authorized','Forged metadata grants no membership');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select throws_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',true,1,'20000000-0000-0000-0000-000000000801')$q$,'42501','Finish operation not authorized','Admin cannot decide normal individual request');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',1,'20000000-0000-0000-0000-000000000801')$q$,'42501','Finish operation not authorized','Cannot request on behalf of another counter');

select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000201','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'42501','Finish operation not authorized','Cross-team request rejected');

select throws_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',true,1,'20000000-0000-0000-0000-000000000801')$q$,'42501','Finish operation not authorized','Counter cannot self approve');

select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',0,'20000000-0000-0000-0000-000000000801')$q$,'40001','Team changed; refresh before deciding','Stale state does not change membership');

select lives_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'T06: own request succeeds through authorized command');

select is((select finish_state from public.team_memberships where id='20000000-0000-0000-0000-000000000301'),'requested','Request blocks participant immediately');
select lives_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',1,'20000000-0000-0000-0000-000000000801')$q$,'T50: exact retry returns original receipt');

select is((select count(*) from public.team_finish_events),1::bigint,'Retry creates no duplicate event');
select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',2,'20000000-0000-0000-0000-000000000801')$q$,'22023','Command identifier already used','Same identifier with changed payload rejected');

select throws_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',2,'20000000-0000-0000-0000-000000000802')$q$,'P0001','No matching individual finish transition','Second distinct request while pending rejected');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);

select is((select count(*) from public.team_finish_events),0::bigint,'Other counter cannot read private finish receipt');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

select throws_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',null,2,'20000000-0000-0000-0000-000000000802')$q$,'22023','Invalid finish command','Null decision cannot become rejection');

select lives_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',false,2,'20000000-0000-0000-0000-000000000802')$q$,'T07: independent rejects individually');

select is((select finish_state from public.team_memberships where id='20000000-0000-0000-0000-000000000301'),'counting','Rejection releases only target');
select is((select actor_membership_id from public.team_finish_events where command_id='20000000-0000-0000-0000-000000000802'),'20000000-0000-0000-0000-000000000303'::uuid,'Protected actor recorded, not supplied by caller');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);

select lives_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',3,'20000000-0000-0000-0000-000000000803')$q$,'Counter can request again after rejection');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

select lives_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000301',true,4,'20000000-0000-0000-0000-000000000804')$q$,'T08: independent accepts first counter');

select is((select phase from public.team_flows where team_id='20000000-0000-0000-0000-000000000200'),'counting','One acceptance does not advance whole team');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);

select lives_ok($q$select public.request_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',5,'20000000-0000-0000-0000-000000000805')$q$,'Second counter can finish later');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

select lives_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',true,6,'20000000-0000-0000-0000-000000000806')$q$,'T09: last accepted request opens reconciliation');

select is((select phase from public.team_flows where team_id='20000000-0000-0000-0000-000000000200'),'reconciling','All accepted advances exactly once');
select lives_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',true,6,'20000000-0000-0000-0000-000000000806')$q$,'Retry last acceptance succeeds after phase advance');

select is((select count(*) from public.team_finish_events),6::bigint,'Six successful decisions, no failed or duplicate events');
select throws_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',false,7,'20000000-0000-0000-0000-000000000807')$q$,'P0001','Individual finish is unavailable in this phase','Cannot reverse accepted finish');

select throws_ok($q$update public.team_finish_events set action='reject'$q$,'42501',null,'Events have no direct client update grant');

select throws_ok($q$insert into public.team_finish_events(team_id) values('20000000-0000-0000-0000-000000000200')$q$,'42501',null,'Cannot forge audit event');

reset role;
select throws_ok($q$delete from public.team_finish_events$q$,'P0001','Finish events are append-only','Privileged cleanup cannot erase audit');

select throws_ok($q$update public.team_finish_events set occurred_at=now()$q$,'P0001','Finish events are append-only','Privileged edit cannot rewrite audit');

-- Current membership, not a previously issued identity, controls replay access.
update public.team_memberships set access_revoked_at=now() where id='20000000-0000-0000-0000-000000000303';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);

select throws_ok($q$select public.decide_team_finish('20000000-0000-0000-0000-000000000200','20000000-0000-0000-0000-000000000302',true,6,'20000000-0000-0000-0000-000000000806')$q$,'42501','Finish operation not authorized','Revoked identity cannot replay a prior command');

select is((select count(*) from public.team_finish_events),0::bigint,'Revoked identity cannot read old receipts');
reset role;
select * from finish();
rollback;
