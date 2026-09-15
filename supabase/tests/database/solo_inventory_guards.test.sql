begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.inventory_items (brand_code, brand_name, bpu, pallet_size)
values ('guard-test-a', 'Synthetic A', 20, 0), ('guard-test-b', 'Synthetic B', 20, 0);
insert into public.solo_sessions (id, title, restrict_to_list)
values ('00000000-0000-0000-0000-000000000701', 'Synthetic guards', true);

-- Exercise triggers as service_role, the same role used by solo Server Actions.
set local role service_role;
select lives_ok(
  $$insert into public.solo_session_items (session_id, brand_code)
    values ('00000000-0000-0000-0000-000000000701', 'guard-test-a')$$,
  'List accepts products before start'
);
select lives_ok(
  $$insert into public.solo_entries (session_id, brand_code, cases, final_cases)
    values ('00000000-0000-0000-0000-000000000701', 'guard-test-a', 20, 20)$$,
  'Allowed count is saved in an open session'
);
select ok((select started_at is not null from public.solo_sessions
  where id='00000000-0000-0000-0000-000000000701'), 'First count durably starts session');
select throws_ok(
  $$insert into public.solo_session_items (session_id, brand_code)
    values ('00000000-0000-0000-0000-000000000701', 'guard-test-b')$$,
  'P0001', 'A started or closed solo list cannot be changed', 'Started list rejects new products'
);
select throws_ok(
  $$update public.solo_sessions set restrict_to_list=false
    where id='00000000-0000-0000-0000-000000000701'$$,
  'P0001', 'A started solo list cannot be changed', 'Restriction cannot be disabled after start'
);
select throws_ok(
  $$update public.inventory_items set bpu=24 where brand_code='guard-test-a'$$,
  'P0001', 'BPU cannot change while a solo count is open', 'Active solo blocks direct BPU edit'
);
select throws_ok(
  $$insert into public.inventory_items (brand_code, brand_name, bpu, pallet_size)
    values ('guard-test-a', 'Synthetic A', 24, 0)
    on conflict (brand_code) do update set bpu=excluded.bpu$$,
  'P0001', 'BPU cannot change while a solo count is open', 'Upsert cannot bypass BPU guard'
);
select lives_ok(
  $$update public.inventory_items set brand_name='Renamed', bpu=20 where brand_code='guard-test-a'$$,
  'Other fields remain editable with unchanged BPU'
);
select throws_ok(
  $$update public.inventory_items set bpu=0 where brand_code='guard-test-a'$$,
  'P0001', 'BPU must be at least 1', 'Zero BPU rejected'
);
select lives_ok(
  $$update public.solo_sessions set status='closed' where id='00000000-0000-0000-0000-000000000701'$$,
  'Session can be closed'
);
select throws_ok(
  $$update public.solo_entries set cases=99 where session_id='00000000-0000-0000-0000-000000000701'$$,
  'P0001', 'Closed solo entries are immutable', 'Closed entry cannot be edited by service_role'
);
select throws_ok(
  $$delete from public.solo_entries where session_id='00000000-0000-0000-0000-000000000701'$$,
  'P0001', 'Closed solo entries are immutable', 'Closed entry cannot be deleted'
);
select throws_ok(
  $$insert into public.solo_entries (session_id, brand_code) values
    ('00000000-0000-0000-0000-000000000701', 'guard-test-b')$$,
  'P0001', 'Closed solo entries are immutable', 'Closed session rejects new entries'
);
select throws_ok(
  $$update public.solo_sessions set status='open' where id='00000000-0000-0000-0000-000000000701'$$,
  'P0001', 'Closed solo sessions are immutable', 'Closed session cannot be reopened'
);
select throws_ok(
  $$delete from public.solo_sessions where id='00000000-0000-0000-0000-000000000701'$$,
  'P0001', 'Closed solo sessions are immutable', 'Closed session cannot be cascade-deleted'
);
select throws_ok(
  $$insert into public.solo_session_items (session_id, brand_code) values
    ('00000000-0000-0000-0000-000000000701', 'guard-test-b')$$,
  'P0001', 'A started or closed solo list cannot be changed', 'Closed list rejects additions'
);
select lives_ok(
  $$update public.inventory_items set bpu=24 where brand_code='guard-test-a'$$,
  'BPU correction allowed without open solo sessions'
);
select results_eq(
  $$select cases, final_cases from public.solo_entries where session_id='00000000-0000-0000-0000-000000000701'$$,
  $$values (20,20)$$,
  'BPU update does not rewrite closed entry quantities'
);
reset role;
select * from finish();
rollback;
