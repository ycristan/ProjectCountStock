-- Security hardening: replace editable Auth user_metadata with server-owned access records.
-- Backfill is intentionally a one-time migration; future authorization reads only public.app_user_access.

create table if not exists public.app_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_kind text not null check (access_kind in ('admin', 'team_counter', 'solo_counter')),
  created_at timestamptz not null default now()
);

alter table public.app_user_access enable row level security;
revoke all on table public.app_user_access from anon, authenticated;
grant all on table public.app_user_access to service_role;

-- Snapshot existing authorization data once. Do not use auth metadata after this point.
insert into public.app_user_access (user_id, access_kind)
select id, 'admin'
from auth.users
where raw_user_meta_data ->> 'role' = 'admin'
on conflict (user_id) do update set access_kind = excluded.access_kind;

insert into public.app_user_access (user_id, access_kind)
select auth_user_id, 'team_counter'
from public.counter_accounts
on conflict (user_id) do update set access_kind = excluded.access_kind;

insert into public.app_user_access (user_id, access_kind)
select id, 'solo_counter'
from auth.users
where (raw_user_meta_data ->> 'is_solo_counter')::boolean is true
on conflict (user_id) do update set access_kind = excluded.access_kind;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_access
    where user_id = auth.uid() and access_kind = 'admin'
  );
$$;

create or replace function private.is_solo_counter()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_access
    where user_id = auth.uid() and access_kind = 'solo_counter'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.is_admin(); $$;

create or replace function public.my_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.counter_accounts
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.my_counter_role()
returns counter_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.counter_accounts
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_team_id() from public, anon;
revoke all on function public.my_counter_role() from public, anon;
grant execute on function public.is_admin(), public.my_team_id(), public.my_counter_role() to authenticated;

-- Administrative database routines are server-only; browser/API callers lose execute permission.
revoke all on function public.finalize_team_count(uuid) from public, anon, authenticated;
revoke all on function public.combine_session_results(uuid) from public, anon, authenticated;
grant execute on function public.finalize_team_count(uuid), public.combine_session_results(uuid) to service_role;

drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists admin_read_counter_accounts on public.counter_accounts;
create policy admin_read_counter_accounts on public.counter_accounts for select to authenticated
using ((select public.is_admin()));

drop policy if exists counter_read_team_accounts on public.counter_accounts;
create policy counter_read_team_accounts on public.counter_accounts for select to authenticated
using (team_id = (select public.my_team_id()));

drop policy if exists solo_entries_admin on public.solo_entries;
create policy solo_entries_admin on public.solo_entries for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists solo_entries_counter on public.solo_entries;
create policy solo_entries_counter on public.solo_entries for all to authenticated
using (
  (select private.is_solo_counter())
  and exists (select 1 from public.solo_sessions s
    where s.id = solo_entries.session_id and s.assigned_to_counter and s.status = 'open')
)
with check (
  (select private.is_solo_counter())
  and exists (select 1 from public.solo_sessions s
    where s.id = solo_entries.session_id and s.assigned_to_counter and s.status = 'open')
);

drop policy if exists solo_session_items_admin on public.solo_session_items;
create policy solo_session_items_admin on public.solo_session_items for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists solo_session_items_counter_select on public.solo_session_items;
create policy solo_session_items_counter_select on public.solo_session_items for select to authenticated
using ((select private.is_solo_counter()) and exists (
  select 1 from public.solo_sessions s
  where s.id = solo_session_items.session_id and s.assigned_to_counter
));

drop policy if exists solo_sessions_admin on public.solo_sessions;
create policy solo_sessions_admin on public.solo_sessions for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists solo_sessions_counter_select on public.solo_sessions;
create policy solo_sessions_counter_select on public.solo_sessions for select to authenticated
using ((select private.is_solo_counter()) and assigned_to_counter);

drop policy if exists solo_sessions_counter_update on public.solo_sessions;
create policy solo_sessions_counter_update on public.solo_sessions for update to authenticated
using ((select private.is_solo_counter()) and assigned_to_counter and status = 'open')
with check ((select private.is_solo_counter()) and assigned_to_counter and status = 'open');
