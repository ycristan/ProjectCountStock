-- Follow-up: keep public RPC wrappers as SECURITY INVOKER.
-- The privileged reads remain in private SECURITY DEFINER functions, which are
-- callable only by authenticated users and always scope themselves to auth.uid().

create or replace function private.my_team_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select team_id from public.counter_accounts
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function private.my_counter_role()
returns counter_role language sql stable security definer set search_path = ''
as $$
  select role from public.counter_accounts
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function private.my_team_id(), private.my_counter_role() from public;
grant execute on function private.my_team_id(), private.my_counter_role() to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_admin(); $$;

create or replace function public.is_solo_counter()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_solo_counter(); $$;

create or replace function public.my_team_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select private.my_team_id(); $$;

create or replace function public.my_counter_role()
returns counter_role language sql stable security invoker set search_path = ''
as $$ select private.my_counter_role(); $$;
