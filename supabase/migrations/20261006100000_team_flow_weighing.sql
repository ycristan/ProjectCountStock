-- Raw weighing data for counts by weight (approved 2026-10-05, for the Audit Count).
-- Each weighed count keeps its rounds (boxes, gross grams), visual cases, tare and
-- weight per unit. The database recomputes the quantity from them: the stored
-- quantity can never disagree with the weighing that produced it.
begin;

alter table public.team_count_records add column weighing jsonb;
alter table public.team_count_records add constraint team_record_weighing_matches_method
  check ((method='weight') = (weighing is not null));
alter table public.team_count_record_history add column weighing jsonb;

-- Same rule as the count form: units = net / weight per unit, rounded up from .7
-- (fraction rounded to 6 places in both, so an exact .7 always rounds up).
create function private.team_weighing(p_weighing jsonb,p_pallets integer,p_cases integer,p_units integer,
  p_weight_avg numeric,p_tare numeric)
returns jsonb language plpgsql immutable security invoker set search_path=''
as $$
declare rounds jsonb; boxes bigint; gross bigint; net numeric; q numeric; expected bigint; visual integer;
begin
  if p_weighing is null or jsonb_typeof(p_weighing)<>'object' or jsonb_typeof(p_weighing->'rounds') is distinct from 'array'
    or jsonb_array_length(p_weighing->'rounds') not between 1 and 100
    or coalesce(p_weighing->>'visualCases','') !~ '^[0-9]{1,6}$'
    or exists (select 1 from jsonb_array_elements(p_weighing->'rounds') r
      where jsonb_typeof(r)<>'object' or coalesce(r->>'boxes','') !~ '^[0-9]{1,6}$'
        or coalesce(r->>'grams','') !~ '^[0-9]{1,12}$') then
    raise exception using errcode='22023',message='Invalid weighing';
  end if;
  select jsonb_agg(jsonb_build_object('boxes',(r->>'boxes')::integer,'grams',(r->>'grams')::bigint) order by o),
    sum((r->>'boxes')::bigint),sum((r->>'grams')::bigint)
    into rounds,boxes,gross from jsonb_array_elements(p_weighing->'rounds') with ordinality x(r,o);
  visual:=(p_weighing->>'visualCases')::integer;
  net:=gross-boxes*p_tare;
  if p_weight_avg is null or p_weight_avg<=0 or net<=0 then
    raise exception using errcode='22023',message='Insufficient net weight';
  end if;
  q:=net/p_weight_avg;
  expected:=case when round(q-floor(q),6)>=0.7 then ceil(q) else floor(q) end;
  if expected<=0 then raise exception using errcode='22023',message='Insufficient net weight'; end if;
  if p_pallets<>0 or p_cases<>visual or p_units<>expected then
    raise exception using errcode='22023',message='Weighing does not match the quantity';
  end if;
  return jsonb_build_object('rounds',rounds,'visualCases',visual,'grossG',gross,'boxes',boxes,
    'tareG',p_tare,'weightAvgG',p_weight_avg,'netG',net);
end;
$$;
revoke all on function private.team_weighing(jsonb,integer,integer,integer,numeric,numeric) from public,anon,authenticated,service_role;
grant execute on function private.team_weighing(jsonb,integer,integer,integer,numeric,numeric) to authenticated;

create or replace function private.guard_team_flow_child()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_team uuid; f public.team_flows; a public.team_slot_assignments; m public.team_memberships;
  v_wh uuid; v_item_wh uuid;
begin
  if tg_op='DELETE' then
    raise exception 'Team flow records cannot be deleted';
  end if;
  v_team := new.team_id;
  if tg_op='UPDATE' and new.team_id is distinct from old.team_id then
    raise exception 'Team attribution cannot change';
  end if;
  select * into strict f from public.team_flows where team_id=v_team for update;
  if f.frozen_at is not null or f.phase='closed' then
    raise exception 'Team results are frozen';
  end if;
  select s.warehouse_id into v_wh from public.teams t
    join public.count_sessions s on s.id=t.session_id
    where t.id=v_team and s.status <> 'fechada';
  if v_wh is null then raise exception 'Session is closed'; end if;

  if tg_table_name='team_count_records' then
    select * into strict a from public.team_slot_assignments where id=new.assignment_id and team_id=v_team;
    select * into strict m from public.team_memberships where id=a.membership_id and team_id=v_team;
    if f.phase <> 'counting' or m.finish_state <> 'counting'
      or m.departed_at is not null or m.access_revoked_at is not null or a.ended_at is not null then
      raise exception 'Participant cannot count now';
    end if;
    if a.slot_id <> new.slot_id then raise exception 'Counting position does not match author assignment'; end if;
    select warehouse_id into v_item_wh from public.inventory_items where brand_code=new.brand_code;
    if v_item_wh is distinct from v_wh then raise exception 'Product does not belong to team warehouse'; end if;
    if tg_op='INSERT' then
      if new.revision <> 0 then raise exception 'Initial revision must be zero'; end if;
    else
      if (new.id,new.assignment_id,new.slot_id,new.brand_code,new.recorded_at)
        is distinct from (old.id,old.assignment_id,old.slot_id,old.brand_code,old.recorded_at) then
        raise exception 'Count authorship cannot change';
      end if;
      if new.revision <> old.revision+1 then raise exception 'Count revision must advance by one'; end if;
      insert into public.team_count_record_history(record_id,revision,quantity_units,pallets,cases,units,pallet_size_at_entry,method,bpu_at_entry,recorded_at,weighing)
      values(old.id,old.revision,old.quantity_units,old.pallets,old.cases,old.units,old.pallet_size_at_entry,old.method,old.bpu_at_entry,old.recorded_at,old.weighing);
    end if;
  elsif tg_table_name='team_memberships' and tg_op='UPDATE' then
    if (new.id,new.user_id,new.role,new.display_order,new.joined_at,new.display_name)
      is distinct from (old.id,old.user_id,old.role,old.display_order,old.joined_at,old.display_name) then
      raise exception 'Membership attribution cannot change';
    end if;
    if old.departed_at is not null and new.departed_at is distinct from old.departed_at
      or old.access_revoked_at is not null and new.access_revoked_at is distinct from old.access_revoked_at then
      raise exception 'Departure and revocation cannot be undone';
    end if;
    if new.finish_state <> old.finish_state and not (
      (old.finish_state='counting' and new.finish_state='requested') or
      (old.finish_state='requested' and new.finish_state in ('counting','accepted'))
    ) then raise exception 'Invalid individual finish transition'; end if;
  elsif tg_table_name='team_slot_assignments' then
    select * into strict m from public.team_memberships where id=new.membership_id and team_id=v_team;
    if tg_op='UPDATE' and (
      (new.id,new.slot_id,new.membership_id,new.started_at) is distinct from
      (old.id,old.slot_id,old.membership_id,old.started_at)
      or old.ended_at is not null and new.ended_at is distinct from old.ended_at
    ) then raise exception 'Assignment history cannot change'; end if;
    -- Exceptional independent assignments require the dedicated command in delivery 6.
    if tg_op='INSERT' and (m.role <> 'counter' or m.departed_at is not null or m.access_revoked_at is not null) then
      raise exception 'Assignment requires an active counter';
    end if;
  elsif tg_table_name='team_count_slots' and tg_op='UPDATE' then
    raise exception 'Counting positions cannot change';
  end if;
  return new;
end;
$$;

drop function public.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric);
drop function private.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric);

-- Unchanged from the foundation except p_weighing (required for counts by weight).
create function private.save_team_count(
  p_team uuid,p_command uuid,p_brand text,p_revision bigint,
  p_pallets integer,p_cases integer,p_units integer,p_weight boolean,
  p_bpu integer,p_pallet_size integer,p_weight_avg numeric,p_tare numeric,p_weighing jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; a public.team_slot_assignments;
  item public.inventory_items; previous public.team_count_records; saved public.team_count_records;
  payload jsonb; command private.team_count_commands; wh uuid; tare numeric; v_weighing jsonb;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Count operation not authorized';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and departed_at is null and access_revoked_at is null;
  if actor.id is null or actor.role<>'counter' or not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Count operation not authorized';
  end if;
  if p_command is null or p_brand is null or p_weight is null or p_pallets is null
    or p_cases is null or p_units is null or least(p_pallets,p_cases,p_units)<0
    or p_revision<0 or (not p_weight and p_weighing is not null) then
    raise exception using errcode='22023',message='Invalid count'; end if;
  payload:=jsonb_build_array(p_brand,p_revision,p_pallets,p_cases,p_units,p_weight,p_bpu,p_pallet_size,p_weight_avg,p_tare,p_weighing);
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    return command.receipt;
  end if;
  if f.phase<>'counting' or f.frozen_at is not null or actor.finish_state<>'counting' then
    raise exception using errcode='42501',message='Counting is blocked'; end if;
  select * into a from public.team_slot_assignments where team_id=p_team and membership_id=actor.id and ended_at is null;
  if a.id is null then raise exception using errcode='42501',message='No counting assignment'; end if;
  select s.warehouse_id,coalesce(s.box_tare_g,300) into wh,tare from public.teams t
    join public.count_sessions s on s.id=t.session_id where t.id=p_team and s.status<>'fechada';
  select * into item from public.inventory_items where brand_code=p_brand and warehouse_id=wh for share;
  if item.brand_code is null then raise exception using errcode='42501',message='Item outside warehouse'; end if;
  if (item.bpu,coalesce(item.pallet_size,0),coalesce(item.weight_avg,0),tare)
    is distinct from (p_bpu,p_pallet_size,p_weight_avg,p_tare) then
    raise exception using errcode='40001',message='Product changed; refresh before counting'; end if;
  if item.bpu<1 or (p_pallets>0 and coalesce(item.pallet_size,0)=0)
    or (item.bpu=1 and (p_pallets>0 or p_cases>0))
    or (p_weight and (coalesce(item.weight_avg,0)<=0 or p_pallets<>0)) then
    raise exception using errcode='22023',message='Counting method unavailable'; end if;
  if p_weight then v_weighing:=private.team_weighing(p_weighing,p_pallets,p_cases,p_units,item.weight_avg,tare); end if;
  if ((p_pallets::bigint*coalesce(item.pallet_size,0)+p_cases)*item.bpu+p_units)>9007199254740991 then
    raise exception using errcode='22023',message='Quantity too large'; end if;
  select * into previous from public.team_count_records where team_id=p_team and slot_id=a.slot_id and brand_code=p_brand;
  if (previous.id is null and p_revision is not null)
    or (previous.id is not null and (previous.assignment_id<>a.id or previous.revision is distinct from p_revision)) then
    raise exception using errcode='40001',message='Count changed; refresh before editing'; end if;
  if previous.id is null then
    insert into public.team_count_records(team_id,assignment_id,slot_id,brand_code,pallets,cases,units,
      pallet_size_at_entry,bpu_at_entry,method,weighing)
    values(p_team,a.id,a.slot_id,p_brand,p_pallets,p_cases,p_units,coalesce(item.pallet_size,0),item.bpu,
      case when p_weight then 'weight' else 'manual' end,v_weighing) returning * into saved;
  else
    update public.team_count_records set pallets=p_pallets,cases=p_cases,units=p_units,
      pallet_size_at_entry=coalesce(item.pallet_size,0),bpu_at_entry=item.bpu,
      method=case when p_weight then 'weight' else 'manual' end,weighing=v_weighing,revision=revision+1
      where id=previous.id returning * into saved;
  end if;
  command.receipt:=jsonb_build_object('revision',saved.revision::text,
    'final_cases',saved.quantity_units/item.bpu,'final_units',saved.quantity_units%item.bpu,'brand_name',item.brand_name);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;
revoke all on function private.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb)
  from public,anon,authenticated,service_role;
create function public.save_team_count(p_team uuid,p_command uuid,p_brand text,p_revision bigint,
  p_pallets integer,p_cases integer,p_units integer,p_weight boolean,
  p_bpu integer,p_pallet_size integer,p_weight_avg numeric,p_tare numeric,p_weighing jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_team_count(p_team,p_command,p_brand,p_revision,p_pallets,p_cases,p_units,p_weight,
    p_bpu,p_pallet_size,p_weight_avg,p_tare,p_weighing);
$$;
revoke all on function public.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb),
  private.save_team_count(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb)
  to authenticated;

commit;
