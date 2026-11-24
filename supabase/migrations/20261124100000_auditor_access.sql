-- Auditor (approved by Yuri on 24/11, DECISOES.md): a third-party observer of the live count.
-- One shared login per session, read-only, ends when the session closes or the admin revokes it.
-- Least privilege: the Auditor gets NO table policy and NO write function. The only things
-- that accept the Auditor are the three read functions below and the two small helpers.
begin;

-- New access kind. The original check is an unnamed column check, so find it by definition.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid='public.app_user_access'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%access_kind%' loop
    execute format('alter table public.app_user_access drop constraint %I',c);
  end loop;
end;
$$;
alter table public.app_user_access add constraint app_user_access_access_kind_check
  check (access_kind in ('admin','team_counter','solo_counter','auditor'));

-- One row per session. team_code/pin are the two 4-digit login PINs shown to the admin
-- (same pattern as teams.team_pin and counter_accounts.user_pin). Written only by the server
-- after it checked the admin; nobody else can read or write the table.
create table public.session_auditors (
  session_id uuid primary key references public.count_sessions(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  team_code text not null check (team_code ~ '^\d{4}$'),
  pin text not null check (pin ~ '^\d{4}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.session_auditors enable row level security;
revoke all on table public.session_auditors from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.session_auditors to service_role;

-- The session this login may watch: only while not revoked and the session is not closed.
create function private.auditor_session()
returns uuid language sql stable security definer set search_path=''
as $$
  select a.session_id from public.session_auditors a
  join public.count_sessions s on s.id=a.session_id
  where auth.uid() is not null and a.user_id=auth.uid()
    and a.revoked_at is null and s.status<>'fechada'
$$;
revoke all on function private.auditor_session() from public,anon;
grant execute on function private.auditor_session() to authenticated;

create function public.is_auditor()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.auditor_session() is not null; $$;
revoke all on function public.is_auditor() from public,anon;
grant execute on function public.is_auditor() to authenticated;

create function private.auditor_can_read_team(p_team uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (select 1 from public.teams t
    where t.id=p_team and t.session_id=private.auditor_session())
$$;
revoke all on function private.auditor_can_read_team(uuid) from public,anon;
grant execute on function private.auditor_can_read_team(uuid) to authenticated;

create function private.read_auditor_teams()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_session uuid;
begin
  v_session:=private.auditor_session();
  if v_session is null then
    raise exception using errcode='42501',message='Auditor access unavailable';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.team_name) order by t.team_name,t.id)
    from public.teams t join public.team_flows f on f.team_id=t.id
    where t.session_id=v_session),'[]'::jsonb);
end;
$$;
revoke all on function private.read_auditor_teams() from public,anon;
grant execute on function private.read_auditor_teams() to authenticated;

create function public.read_auditor_teams()
returns jsonb language sql security invoker set search_path='' as $$ select private.read_auditor_teams(); $$;
revoke all on function public.read_auditor_teams() from public,anon;
grant execute on function public.read_auditor_teams() to authenticated;

-- The three read functions accept the Auditor in addition to what they accepted before.
-- Everything else in each body is unchanged from the previous definition.
create or replace function private.read_team_inventory(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare wh uuid; tare numeric;
begin
  if not (private.team_flow_visible(p_team,false) or private.auditor_can_read_team(p_team)) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select s.warehouse_id,coalesce(s.box_tare_g,300) into wh,tare
    from public.teams t join public.count_sessions s on s.id=t.session_id
    join public.team_flows f on f.team_id=t.id
    where t.id=p_team and s.status<>'fechada' and f.phase<>'closed';
  if wh is null then raise exception using errcode='42501',message='Team access unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('brand_code',i.brand_code,'brand_name',i.brand_name,
    'brand_active',i.brand_active,'bpu',i.bpu,'pallet_size',coalesce(i.pallet_size,0),
    'weight_avg',coalesce(i.weight_avg,0),'box_tare_g',tare,
    'bins',coalesce((select jsonb_agg(b.bin_location order by b.bin_location)
      from public.item_bin_locations b where b.brand_code=i.brand_code),'[]')) order by i.brand_code)
    from public.inventory_items i where i.warehouse_id=wh),'[]');
end;
$$;

create or replace function private.read_team_count(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare actor public.team_memberships; f public.team_flows; monitor boolean; auditor boolean;
begin
  auditor:=private.auditor_can_read_team(p_team);
  if not (private.team_flow_visible(p_team,false) or auditor) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select * into strict f from public.team_flows where team_id=p_team;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and departed_at is null and access_revoked_at is null;
  monitor:=private.is_admin() or actor.role='independent' or auditor;
  if not exists(select 1 from public.teams t join public.count_sessions s on s.id=t.session_id
    where t.id=p_team and s.status<>'fechada') or f.phase='closed' then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  return jsonb_build_object(
    'teamId',p_team,'phase',f.phase,'revision',f.revision::text,
    'role',case when private.is_admin() then 'admin' when auditor then 'auditor' else actor.role end,
    'membershipId',actor.id,'finishState',actor.finish_state,
    'teamName',(select team_name from public.teams where id=p_team),
    'warehouseName',(select w.name from public.teams t join public.count_sessions s on s.id=t.session_id
      join public.warehouses w on w.id=s.warehouse_id where t.id=p_team),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,
      'role',m.role,'order',m.display_order,'finishState',m.finish_state,'departed',m.departed_at is not null) order by m.display_order)
      from public.team_memberships m where m.team_id=p_team),'[]'),
    'records',coalesce((select jsonb_agg(jsonb_build_object('brandCode',r.brand_code,
      'membershipId',a.membership_id,'pallets',r.pallets,'cases',r.cases,'units',r.units,
      'quantity',r.quantity_units::text,'method',r.method,'revision',r.revision::text) order by r.brand_code)
      from public.team_count_records r join public.team_slot_assignments a on a.id=r.assignment_id
      where r.team_id=p_team and (monitor or a.membership_id=actor.id)),'[]')
  );
end;
$$;

create or replace function private.read_team_comparison(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare f public.team_flows; open_round uuid;
begin
  if not (private.team_flow_visible(p_team,true) or private.auditor_can_read_team(p_team)) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select * into strict f from public.team_flows where team_id=p_team;
  if f.phase in ('setup','counting') then return '[]'::jsonb; end if;
  open_round:=private.team_open_round(p_team);
  return coalesce((select jsonb_agg(jsonb_build_object('brandCode',c.brand_code,'status',c.status,
      'limit',c.tolerance_limit::text,'cells',c.cells,
      'decision',(select jsonb_build_object('decision',d.decision,'recordId',d.chosen_record_id,
          'quantity',d.quantity_units::text,'decidedAt',d.decided_at)
        from public.team_item_decisions d where d.team_id=p_team and d.brand_code=c.brand_code
        order by d.decided_at desc, d.id desc limit 1),
      'reconciliation',(select jsonb_build_object('pallets',r.pallets,'cases',r.cases,'units',r.units,
          'quantity',r.quantity_units::text,'method',r.method,'recordedAt',r.recorded_at)
        from public.team_reconciliations r where r.team_id=p_team and r.brand_code=c.brand_code
          and r.recount_review_id is not distinct from l.review_id
        order by r.recorded_at desc, r.id desc limit 1),
      'recounts',coalesce(l.rounds,0),
      'selected',open_round is not null and l.review_id is not distinct from open_round)
    order by c.brand_code) from private.team_comparison(p_team) c
    left join private.team_last_round(p_team) l on l.brand_code=c.brand_code),'[]'::jsonb);
end;
$$;

commit;
