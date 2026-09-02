begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Synthetic data only. This transaction is rolled back at the end of the test.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000101', 'admin-test@example.invalid', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000102', 'spoofed-admin@example.invalid', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000103', 'team-counter@example.invalid', '{"role":"counter","team_id":"00000000-0000-0000-0000-000000000201"}'),
  ('00000000-0000-0000-0000-000000000104', 'solo-counter@example.invalid', '{"role":"counter","is_solo_counter":true}');

insert into public.count_sessions (id)
values ('00000000-0000-0000-0000-000000000301');

insert into public.teams (id, session_id, team_name)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000301',
  'Synthetic security test team'
);

insert into public.counter_accounts (auth_user_id, team_id, role, username)
values (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000201',
  'contador_1',
  '99990001'
);

insert into public.app_user_access (user_id, access_kind)
values
  ('00000000-0000-0000-0000-000000000101', 'admin'),
  ('00000000-0000-0000-0000-000000000103', 'team_counter'),
  ('00000000-0000-0000-0000-000000000104', 'solo_counter');

select has_table('public', 'app_user_access', 'Protected authorization table exists');
select has_column(
  'public',
  'counter_accounts',
  'user_pin',
  'Legacy user PIN column is present in a fresh database'
);
select results_eq(
  $$select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('convert_count', 'finalize_team_count', 'combine_session_results')
      and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public, pg_temp%'$$,
  array[3::bigint],
  'Privileged legacy functions have a fixed search path'
);
select ok(
  not has_table_privilege('authenticated', 'public.app_user_access', 'select'),
  'Authenticated users cannot read the authorization table directly'
);
select results_eq(
  $$select count(*) from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ilike '%user_metadata%'
        or coalesce(with_check, '') ilike '%user_metadata%')$$,
  array[0::bigint],
  'No public RLS policy authorizes access through editable user_metadata'
);
select ok(
  not has_function_privilege('anon', 'public.finalize_team_count(uuid)', 'execute'),
  'Anonymous callers cannot execute finalize_team_count'
);
select ok(
  not has_function_privilege('authenticated', 'public.combine_session_results(uuid)', 'execute'),
  'Authenticated callers cannot execute combine_session_results'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_team_count(uuid)', 'execute'),
  'Only the server service role can execute finalize_team_count'
);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select is(public.is_admin(), true, 'Protected admin record grants administrator access');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select is(
  public.is_admin(),
  false,
  'Editable user_metadata claiming admin does not grant administrator access'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select is(
  public.my_team_id(),
  '00000000-0000-0000-0000-000000000201'::uuid,
  'Team scope is read from the protected counter account'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
select is(public.is_solo_counter(), true, 'Protected solo-counter record grants solo access');

select * from finish();

rollback;
