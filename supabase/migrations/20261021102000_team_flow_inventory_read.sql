-- Block 5: the team screen loads the warehouse inventory once, not on every refresh.
-- read_team_count keeps state/members/records; read_team_inventory returns the items.
begin;

create function private.read_team_inventory(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare wh uuid; tare numeric;
begin
  if not private.team_flow_visible(p_team,false) then
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
declare actor public.team_memberships; f public.team_flows; monitor boolean;
begin
  if not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select * into strict f from public.team_flows where team_id=p_team;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and departed_at is null and access_revoked_at is null;
  monitor:=private.is_admin() or actor.role='independent';
  if not exists(select 1 from public.teams t join public.count_sessions s on s.id=t.session_id
    where t.id=p_team and s.status<>'fechada') or f.phase='closed' then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  return jsonb_build_object(
    'teamId',p_team,'phase',f.phase,'revision',f.revision::text,
    'role',case when private.is_admin() then 'admin' else actor.role end,
    'membershipId',actor.id,'finishState',actor.finish_state,
    'teamName',(select team_name from public.teams where id=p_team),
    'warehouseName',(select w.name from public.teams t join public.count_sessions s on s.id=t.session_id
      join public.warehouses w on w.id=s.warehouse_id where t.id=p_team),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,
      'role',m.role,'order',m.display_order,'finishState',m.finish_state) order by m.display_order)
      from public.team_memberships m where m.team_id=p_team),'[]'),
    'records',coalesce((select jsonb_agg(jsonb_build_object('brandCode',r.brand_code,
      'membershipId',a.membership_id,'pallets',r.pallets,'cases',r.cases,'units',r.units,
      'quantity',r.quantity_units::text,'method',r.method,'revision',r.revision::text) order by r.brand_code)
      from public.team_count_records r join public.team_slot_assignments a on a.id=r.assignment_id
      where r.team_id=p_team and (monitor or a.membership_id=actor.id)),'[]')
  );
end;
$$;

create function public.read_team_inventory(p_team uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_team_inventory(p_team); $$;
revoke all on function private.read_team_inventory(uuid), public.read_team_inventory(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.read_team_inventory(uuid), public.read_team_inventory(uuid) to authenticated;

commit;
