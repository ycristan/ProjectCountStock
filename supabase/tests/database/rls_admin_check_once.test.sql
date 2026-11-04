begin;

create extension if not exists pgtap with schema extensions;

select plan(1);

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

select * from finish();
rollback;
