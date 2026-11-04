begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- An admin check written bare runs once per row; it must be wrapped in (select ...).
-- Strip the wrapped form, then any is_admin() left over is a per-row call.
select is_empty(
  $$
    select tablename || '.' || policyname
    from pg_policies
    where schemaname = 'public'
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            'SELECT (private\.)?is_admin\(\)', '', 'gi') ~* 'is_admin\(\)'
  $$,
  'No RLS policy calls is_admin() once per row'
);

-- can_read_warehouse(warehouse_id) in a policy also runs once per row.
select is_empty(
  $$
    select tablename || '.' || policyname
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* 'can_read_warehouse\('
  $$,
  'No RLS policy calls can_read_warehouse() once per row'
);

-- The readable-warehouse list runs as security definer: logged-in users only.
select ok(not has_function_privilege('anon', 'private.readable_warehouse_ids()', 'execute'),
  'Anonymous cannot call readable_warehouse_ids()');
select ok(has_function_privilege('authenticated', 'private.readable_warehouse_ids()', 'execute'),
  'Authenticated users can call readable_warehouse_ids()');

select * from finish();
rollback;
