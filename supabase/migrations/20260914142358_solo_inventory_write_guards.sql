-- Guard the three contracts diagnosed in PR #69. No production data is deleted.
-- Solo start is durable, including when its entries are subsequently removed.
alter table public.solo_sessions add column if not exists started_at timestamptz;
update public.solo_sessions s
set started_at = coalesce(
  (select min(e.counted_at) from public.solo_entries e where e.session_id = s.id),
  s.created_at
)
where s.started_at is null and (
  nullif(s.counter_name, '') is not null
  or exists (select 1 from public.solo_entries e where e.session_id = s.id)
);
create index if not exists solo_sessions_open_guard_idx
  on public.solo_sessions (id) where status = 'open';

-- All functions are invoker functions; they restrict writes and confer no privilege.
-- Session lifecycle and BPU changes share a short transaction lock so a concurrent
-- session creation cannot slip between checking for open sessions and changing BPU.
create or replace function private.guard_solo_session_lifecycle()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then raise exception 'Closed solo sessions are immutable'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  elsif new.status is distinct from old.status then
    perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'closed' and new is distinct from old then
      raise exception 'Closed solo sessions are immutable';
    end if;
    if old.started_at is not null then
      if new.started_at is distinct from old.started_at then
        raise exception 'Solo count start cannot be reset';
      end if;
      if new.restrict_to_list is distinct from old.restrict_to_list then
        raise exception 'A started solo list cannot be changed';
      end if;
    end if;
  end if;
  if new.started_at is null and nullif(new.counter_name, '') is not null then
    new.started_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger guard_solo_session_lifecycle
before insert or update or delete on public.solo_sessions
for each row execute function private.guard_solo_session_lifecycle();

create or replace function private.guard_solo_entry_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  target_id uuid;
  s public.solo_sessions%rowtype;
begin
  if tg_op = 'DELETE' then target_id := old.session_id;
  else target_id := new.session_id;
  end if;
  if tg_op = 'UPDATE' and
    (new.session_id is distinct from old.session_id or new.brand_code is distinct from old.brand_code) then
    raise exception 'Solo entry identity cannot be changed';
  end if;
  select * into s from public.solo_sessions where id = target_id for update;
  if not found then
    -- Permit the existing cascade when deleting an OPEN parent session.
    -- Closed parent deletion is rejected by its lifecycle trigger.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Solo session is unavailable';
  end if;
  if s.status <> 'open' then raise exception 'Closed solo entries are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if s.restrict_to_list and not exists (
    select 1 from public.solo_session_items
    where session_id = target_id and brand_code = new.brand_code
  ) then raise exception 'Item is not in the pre-selected solo list'; end if;
  if s.started_at is null then
    update public.solo_sessions set started_at = pg_catalog.clock_timestamp() where id = target_id;
  end if;
  return new;
end;
$$;

create trigger guard_solo_entry_write
before insert or update or delete on public.solo_entries
for each row execute function private.guard_solo_entry_write();

create or replace function private.guard_solo_list_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  target_id uuid;
  s public.solo_sessions%rowtype;
begin
  if tg_op = 'DELETE' then target_id := old.session_id;
  else target_id := new.session_id;
  end if;
  if tg_op = 'UPDATE' and
    (new.session_id is distinct from old.session_id or new.brand_code is distinct from old.brand_code) then
    raise exception 'Solo list item identity cannot be changed';
  end if;
  select * into s from public.solo_sessions where id = target_id for update;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Solo session is unavailable';
  end if;
  if s.status <> 'open' or s.started_at is not null then
    raise exception 'A started or closed solo list cannot be changed';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger guard_solo_list_write
before insert or update or delete on public.solo_session_items
for each row execute function private.guard_solo_list_write();

create or replace function private.guard_inventory_bpu()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.bpu is null or new.bpu < 1 then raise exception 'BPU must be at least 1'; end if;
  if tg_op = 'UPDATE' and new.bpu is distinct from old.bpu then
    perform pg_catalog.pg_advisory_xact_lock(6969, 1);
    if exists (select 1 from public.solo_sessions where status = 'open') then
      raise exception 'BPU cannot change while a solo count is open';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_inventory_bpu
before insert or update on public.inventory_items
for each row execute function private.guard_inventory_bpu();

revoke all on function private.guard_solo_session_lifecycle(),
  private.guard_solo_entry_write(), private.guard_solo_list_write(),
  private.guard_inventory_bpu() from public, anon, authenticated;
-- Trigger invocation is not a public RPC. Existing table permissions/RLS remain.
