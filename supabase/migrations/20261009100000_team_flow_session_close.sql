-- Block 12 (R13, revised 2026-10-07): after every team of a session is closed the
-- admin sees the active products nobody counted (ordered by BIN) and acknowledges
-- the list once. The consolidated result is frozen in the same transaction and
-- the session closes. Uncounted active products are 0 and marked; inactive
-- products nobody counted get no line.
begin;

create table public.team_session_results (
  session_id uuid primary key references public.count_sessions(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_name text not null,
  acknowledged_by uuid not null references auth.users(id) on delete restrict,
  acknowledged_at timestamptz not null default clock_timestamp(),
  uncounted_count integer not null check (uncounted_count >= 0),
  teams jsonb not null check (jsonb_typeof(teams)='array')
);
create index team_session_results_wh_idx on public.team_session_results(warehouse_id);
create index team_session_results_actor_idx on public.team_session_results(acknowledged_by);

create table public.team_session_result_items (
  session_id uuid not null references public.team_session_results(session_id) on delete restrict,
  brand_code text not null references public.inventory_items(brand_code) on delete restrict,
  brand_name text not null,
  category text,
  category1 text,
  bpu integer not null check (bpu >= 1),
  brand_active boolean not null,
  bin_locations jsonb not null check (jsonb_typeof(bin_locations)='array'),
  quantity_units bigint not null check (quantity_units >= 0),
  final_cases bigint generated always as (quantity_units / bpu) stored,
  final_units bigint generated always as (quantity_units % bpu) stored,
  uncounted boolean not null,
  -- Official quantity of each team that counted the product (never the counters).
  team_quantities jsonb not null check (jsonb_typeof(team_quantities)='array'),
  primary key(session_id,brand_code),
  check (not uncounted or (quantity_units=0 and brand_active and team_quantities='[]'::jsonb))
);
create index team_session_result_items_brand_idx on public.team_session_result_items(brand_code);

do $$
declare tab text;
begin
  foreach tab in array array['team_session_results','team_session_result_items'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to authenticated,service_role',tab);
    execute format('create policy team_session_result_admin_read on public.%I for select to authenticated using (private.is_admin())',tab);
  end loop;
end;
$$;

create function private.guard_team_session_result()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op<>'INSERT' then raise exception 'Session results are immutable'; end if;
  if not exists(select 1 from public.count_sessions where id=new.session_id and status<>'fechada') then
    raise exception 'Session is closed';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_team_session_result() from public,anon,authenticated,service_role;
create trigger guard_team_session_result before insert or update or delete on public.team_session_results
for each row execute function private.guard_team_session_result();
create trigger guard_team_session_result before insert or update or delete on public.team_session_result_items
for each row execute function private.guard_team_session_result();

-- Foundation guard: the versioned session closes only through the consolidation above.
create or replace function private.guard_legacy_team_flow_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare target_id uuid;
begin
  if tg_table_name='count_sessions' then
    target_id := old.id;
    if (tg_op='DELETE' or new.status is distinct from old.status) and exists (
      select 1 from public.team_flows f join public.teams t on t.id=f.team_id where t.session_id=target_id
    ) and not (tg_op='UPDATE' and new.status='fechada'
      and exists (select 1 from public.team_session_results where session_id=target_id)) then
      raise exception 'Use the versioned team session workflow';
    end if;
  else
    if tg_op='DELETE' then target_id := old.team_id; else target_id := new.team_id; end if;
    if exists (select 1 from public.team_flows where team_id=target_id)
      or (tg_op='UPDATE' and exists (select 1 from public.team_flows where team_id=old.team_id)) then
      raise exception 'Legacy writes cannot change a versioned team';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

-- Teams of the session with their phase; ready when there is at least one team,
-- every team uses the versioned flow and every team is closed.
create function private.team_session_teams(p_session uuid)
returns table(team_id uuid, team_name text, phase text, version_id uuid)
language sql stable security invoker set search_path = ''
as $$
  select t.id,t.team_name,f.phase,f.result_version_id
  from public.teams t left join public.team_flows f on f.team_id=t.id
  where t.session_id=p_session order by t.team_name,t.id;
$$;
revoke all on function private.team_session_teams(uuid) from public,anon,authenticated,service_role;

-- Active products of the warehouse that no team's final result contains, by first BIN.
create function private.team_session_uncounted(p_session uuid)
returns table(brand_code text, brand_name text, bins jsonb)
language sql stable security invoker set search_path = ''
as $$
  select i.brand_code,i.brand_name,
    coalesce((select jsonb_agg(b.bin_location order by b.bin_location) from public.item_bin_locations b
      where b.brand_code=i.brand_code),'[]'::jsonb)
  from public.inventory_items i
  join public.count_sessions s on s.id=p_session and s.warehouse_id=i.warehouse_id
  where i.brand_active and not exists (
    select 1 from private.team_session_teams(p_session) t
    join public.team_result_items r on r.version_id=t.version_id and r.brand_code=i.brand_code)
  order by (select min(b.bin_location) from public.item_bin_locations b where b.brand_code=i.brand_code) nulls last,
    i.brand_code;
$$;
revoke all on function private.team_session_uncounted(uuid) from public,anon,authenticated,service_role;

create function private.read_team_session_closing(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare s public.count_sessions; ready boolean; r public.team_session_results;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Not authorized';
  end if;
  select * into s from public.count_sessions where id=p_session;
  if s.id is null then raise exception using errcode='22023',message='Session not found'; end if;
  select * into r from public.team_session_results where session_id=p_session;
  select count(*)>0 and bool_and(phase='closed') into ready from private.team_session_teams(p_session);
  return jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('teamId',t.team_id,'name',t.team_name,'phase',t.phase))
      from private.team_session_teams(p_session) t),'[]'::jsonb),
    'ready',coalesce(ready,false) and r.session_id is null,
    'uncounted',case when coalesce(ready,false) and r.session_id is null then
      coalesce((select jsonb_agg(jsonb_build_object('brandCode',u.brand_code,'brandName',u.brand_name,'bins',u.bins))
        from private.team_session_uncounted(p_session) u),'[]'::jsonb) else '[]'::jsonb end,
    'closed',case when r.session_id is null then null else jsonb_build_object(
      'acknowledgedAt',r.acknowledged_at,'uncountedCount',r.uncounted_count) end);
end;
$$;
revoke all on function private.read_team_session_closing(uuid) from public,anon,authenticated,service_role;

-- The admin acknowledges exactly the list they saw; if it changed, refresh first.
create function private.close_team_session(p_session uuid,p_uncounted text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.count_sessions; r public.team_session_results; seen text[]; actual text[];
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Not authorized';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(6969, 1);
  select * into s from public.count_sessions where id=p_session for update;
  if s.id is null then raise exception using errcode='22023',message='Session not found'; end if;
  select * into r from public.team_session_results where session_id=p_session;
  if r.session_id is not null then
    return jsonb_build_object('acknowledgedAt',r.acknowledged_at,'uncountedCount',r.uncounted_count);
  end if;
  if s.status='fechada' then raise exception 'Session is closed'; end if;
  if not exists(select 1 from private.team_session_teams(p_session))
    or exists(select 1 from private.team_session_teams(p_session) where phase is distinct from 'closed') then
    raise exception 'Every team must be closed before the session';
  end if;
  select coalesce(array_agg(x order by x),'{}') into seen from (select distinct unnest(p_uncounted) x) y where x is not null;
  select coalesce(array_agg(brand_code order by brand_code),'{}') into actual from private.team_session_uncounted(p_session);
  if seen is distinct from actual then
    raise exception using errcode='40001',message='Uncounted list changed; refresh before closing';
  end if;
  insert into public.team_session_results(session_id,warehouse_id,warehouse_name,acknowledged_by,uncounted_count,teams)
  select p_session,s.warehouse_id,w.name,auth.uid(),cardinality(actual),
    (select jsonb_agg(jsonb_build_object('teamId',t.team_id,'name',t.team_name,'versionId',t.version_id))
      from private.team_session_teams(p_session) t)
  from public.warehouses w where w.id=s.warehouse_id;
  -- Counted products: sum of each team's official result; attributes from the
  -- latest sealed team snapshot that holds the product.
  insert into public.team_session_result_items(session_id,brand_code,brand_name,category,category1,bpu,
    brand_active,bin_locations,quantity_units,uncounted,team_quantities)
  select p_session,x.brand_code,
    (array_agg(x.brand_name order by x.sealed_at desc))[1],(array_agg(x.category order by x.sealed_at desc))[1],
    (array_agg(x.category1 order by x.sealed_at desc))[1],(array_agg(x.bpu order by x.sealed_at desc))[1],
    (array_agg(x.brand_active order by x.sealed_at desc))[1],(array_agg(x.bin_locations order by x.sealed_at desc))[1],
    sum(x.quantity_units),false,
    jsonb_agg(jsonb_build_object('teamId',x.team_id,'name',x.team_name,'quantity',x.quantity_units) order by x.team_name,x.team_id)
  from (select r2.*,v.sealed_at,t.team_name from private.team_session_teams(p_session) t
    join public.team_result_versions v on v.id=t.version_id
    join public.team_result_items r2 on r2.version_id=v.id) x
  group by x.brand_code;
  insert into public.team_session_result_items(session_id,brand_code,brand_name,category,category1,bpu,
    brand_active,bin_locations,quantity_units,uncounted,team_quantities)
  select p_session,i.brand_code,i.brand_name,i.category,i.category1,i.bpu,true,u.bins,0,true,'[]'::jsonb
  from private.team_session_uncounted(p_session) u join public.inventory_items i on i.brand_code=u.brand_code;
  update public.count_sessions set status='fechada' where id=p_session;
  select * into r from public.team_session_results where session_id=p_session;
  return jsonb_build_object('acknowledgedAt',r.acknowledged_at,'uncountedCount',r.uncounted_count);
end;
$$;
revoke all on function private.close_team_session(uuid,text[]) from public,anon,authenticated,service_role;

create function public.read_team_session_closing(p_session uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_team_session_closing(p_session); $$;
create function public.close_team_session(p_session uuid,p_uncounted text[])
returns jsonb language sql security invoker set search_path='' as $$ select private.close_team_session(p_session,p_uncounted); $$;
revoke all on function public.read_team_session_closing(uuid),public.close_team_session(uuid,text[])
  from public,anon,authenticated,service_role;
grant execute on function public.read_team_session_closing(uuid),private.read_team_session_closing(uuid),
  public.close_team_session(uuid,text[]),private.close_team_session(uuid,text[]) to authenticated;

commit;
