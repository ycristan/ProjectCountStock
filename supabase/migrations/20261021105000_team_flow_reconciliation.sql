-- Block 7: the Independent records a reconciled count for each divergent item and
-- submits the team to the admin. Counter records are never changed: the reconciled
-- count is a separate, append-only row (latest per product is current).
begin;

create table public.team_reconciliations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  brand_code text not null references public.inventory_items(brand_code) on delete restrict,
  pallets integer not null default 0 check (pallets >= 0),
  cases integer not null default 0 check (cases >= 0),
  units integer not null default 0 check (units >= 0),
  pallet_size_at_entry integer not null default 0 check (pallet_size_at_entry >= 0),
  bpu_at_entry integer not null check (bpu_at_entry >= 1),
  quantity_units bigint generated always as
    ((pallets::bigint * pallet_size_at_entry + cases) * bpu_at_entry + units) stored,
  method text not null check (method in ('manual','weight')),
  weighing jsonb,
  reconciled_by uuid not null,
  flow_revision bigint not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (team_id,reconciled_by) references public.team_memberships(team_id,id) on delete restrict,
  check (pallets = 0 or pallet_size_at_entry > 0),
  check ((method='weight') = (weighing is not null))
);
create index team_reconciliations_item_idx on public.team_reconciliations(team_id,brand_code,recorded_at);
create index team_reconciliations_actor_idx on public.team_reconciliations(team_id,reconciled_by);
create index team_reconciliations_brand_idx on public.team_reconciliations(brand_code);
alter table public.team_reconciliations enable row level security;
revoke all on public.team_reconciliations from public,anon,authenticated,service_role;
grant select on public.team_reconciliations to authenticated,service_role;
create policy team_reconciliation_read on public.team_reconciliations for select to authenticated
  using (private.team_flow_visible(team_id,true));

create function private.guard_team_reconciliation()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Reconciliations are append-only'; end; $$;
revoke all on function private.guard_team_reconciliation() from public,anon,authenticated,service_role;
create trigger guard_team_reconciliation before update or delete on public.team_reconciliations
for each row execute function private.guard_team_reconciliation();

-- Latest Independent choice and latest reconciled count per product.
create function private.team_resolutions(p_team uuid)
returns table(brand_code text, status text, quantity_units bigint, resolution text, resolved_by uuid)
language sql stable security invoker set search_path = ''
as $$
  with d as (
    select distinct on (x.brand_code) x.brand_code,x.decision,x.quantity_units,x.decided_by
    from public.team_item_decisions x where x.team_id=p_team
    order by x.brand_code,x.decided_at desc,x.id desc
  ), r as (
    select distinct on (x.brand_code) x.brand_code,x.quantity_units,x.reconciled_by
    from public.team_reconciliations x where x.team_id=p_team
    order by x.brand_code,x.recorded_at desc,x.id desc
  )
  select c.brand_code,c.status,
    case when c.status='equal' then (c.cells->0->>'quantity')::bigint
      when c.status='tolerance' and d.decision='accept_value' then d.quantity_units
      when c.status='reconcile' or d.decision='reconcile' then r.quantity_units end,
    case when c.status='equal' then 'equal'
      when c.status='tolerance' and d.decision='accept_value' then 'weight_tolerance'
      else 'reconciled' end,
    case when c.status='tolerance' and d.decision='accept_value' then d.decided_by
      when c.status='reconcile' or d.decision='reconcile' then r.reconciled_by end
  from private.team_comparison(p_team) c
  left join d on d.brand_code=c.brand_code
  left join r on r.brand_code=c.brand_code;
$$;
revoke all on function private.team_resolutions(uuid) from public,anon,authenticated,service_role;

create or replace function private.read_team_comparison(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare f public.team_flows;
begin
  if not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select * into strict f from public.team_flows where team_id=p_team;
  if f.phase in ('setup','counting') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('brandCode',c.brand_code,'status',c.status,
      'limit',c.tolerance_limit::text,'cells',c.cells,
      'decision',(select jsonb_build_object('decision',d.decision,'recordId',d.chosen_record_id,
          'quantity',d.quantity_units::text,'decidedAt',d.decided_at)
        from public.team_item_decisions d where d.team_id=p_team and d.brand_code=c.brand_code
        order by d.decided_at desc, d.id desc limit 1),
      'reconciliation',(select jsonb_build_object('pallets',r.pallets,'cases',r.cases,'units',r.units,
          'quantity',r.quantity_units::text,'method',r.method,'recordedAt',r.recorded_at)
        from public.team_reconciliations r where r.team_id=p_team and r.brand_code=c.brand_code
        order by r.recorded_at desc, r.id desc limit 1))
    order by c.brand_code) from private.team_comparison(p_team) c),'[]'::jsonb);
end;
$$;

-- R06: only items that need reconciliation (difference, missing count, or a
-- tolerance item the Independent sent to reconciliation) take a reconciled count.
create function private.save_team_reconciliation(
  p_team uuid,p_command uuid,p_brand text,p_expected_revision bigint,
  p_pallets integer,p_cases integer,p_units integer,p_weight boolean,
  p_bpu integer,p_pallet_size integer,p_weight_avg numeric,p_tare numeric,p_weighing jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; item public.inventory_items;
  command private.team_count_commands; payload jsonb; wh uuid; tare numeric; v_weighing jsonb;
  c record; latest text; saved public.team_reconciliations;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Reconciliation not authorized';
  end if;
  if p_command is null or p_brand is null or p_weight is null or p_expected_revision is null
    or p_pallets is null or p_cases is null or p_units is null or least(p_pallets,p_cases,p_units)<0
    or (not p_weight and p_weighing is not null) then
    raise exception using errcode='22023',message='Invalid reconciliation';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and role='independent' and departed_at is null and access_revoked_at is null;
  if actor.id is null or f.team_id is null then
    raise exception using errcode='42501',message='Reconciliation not authorized';
  end if;
  payload:=jsonb_build_array('reconcile',p_brand,p_expected_revision,p_pallets,p_cases,p_units,p_weight,
    p_bpu,p_pallet_size,p_weight_avg,p_tare,p_weighing);
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    return command.receipt;
  end if;
  if f.phase<>'reconciling' or f.frozen_at is not null then
    raise exception 'Reconciliation is only available during reconciliation';
  end if;
  if f.revision<>p_expected_revision then
    raise exception using errcode='40001',message='Team changed; refresh before reconciling';
  end if;
  select * into c from private.team_comparison(p_team) x where x.brand_code=p_brand;
  select d.decision into latest from public.team_item_decisions d where d.team_id=p_team and d.brand_code=p_brand
    order by d.decided_at desc,d.id desc limit 1;
  if c.brand_code is null or c.status='equal' or (c.status='tolerance' and latest is distinct from 'reconcile') then
    raise exception 'Item does not need reconciliation';
  end if;
  select s.warehouse_id,coalesce(s.box_tare_g,300) into wh,tare from public.teams t
    join public.count_sessions s on s.id=t.session_id where t.id=p_team and s.status<>'fechada';
  select * into item from public.inventory_items where brand_code=p_brand and warehouse_id=wh for share;
  if item.brand_code is null then raise exception using errcode='42501',message='Item outside warehouse'; end if;
  if (item.bpu,coalesce(item.pallet_size,0),coalesce(item.weight_avg,0),tare)
    is distinct from (p_bpu,p_pallet_size,p_weight_avg,p_tare) then
    raise exception using errcode='40001',message='Product changed; refresh before reconciling'; end if;
  if item.bpu<1 or (p_pallets>0 and coalesce(item.pallet_size,0)=0)
    or (item.bpu=1 and (p_pallets>0 or p_cases>0))
    or (p_weight and (coalesce(item.weight_avg,0)<=0 or p_pallets<>0)) then
    raise exception using errcode='22023',message='Counting method unavailable'; end if;
  if p_weight then v_weighing:=private.team_weighing(p_weighing,p_pallets,p_cases,p_units,item.weight_avg,tare); end if;
  if ((p_pallets::bigint*coalesce(item.pallet_size,0)+p_cases)*item.bpu+p_units)>9007199254740991 then
    raise exception using errcode='22023',message='Quantity too large'; end if;
  insert into public.team_reconciliations(team_id,brand_code,pallets,cases,units,pallet_size_at_entry,
    bpu_at_entry,method,weighing,reconciled_by,flow_revision)
  values(p_team,p_brand,p_pallets,p_cases,p_units,coalesce(item.pallet_size,0),item.bpu,
    case when p_weight then 'weight' else 'manual' end,v_weighing,actor.id,f.revision)
  returning * into saved;
  command.receipt:=jsonb_build_object('quantity',saved.quantity_units::text,
    'final_cases',saved.quantity_units/item.bpu,'final_units',saved.quantity_units%item.bpu,'brand_name',item.brand_name);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;
revoke all on function private.save_team_reconciliation(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb)
  from public,anon,authenticated,service_role;

-- R07: submission needs every counted product resolved; it seals the result
-- version the admin reviews (same transaction as the phase change).
create function private.submit_team_reconciliation(p_team uuid,p_expected_revision bigint,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; command private.team_count_commands;
  payload jsonb; results jsonb; pending bigint; v_id uuid;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Submission not authorized';
  end if;
  if p_command is null or p_expected_revision is null then
    raise exception using errcode='22023',message='Invalid submission';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and role='independent' and departed_at is null and access_revoked_at is null;
  if actor.id is null or f.team_id is null then
    raise exception using errcode='42501',message='Submission not authorized';
  end if;
  payload:=jsonb_build_array('submit',p_expected_revision);
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    return command.receipt;
  end if;
  if f.phase<>'reconciling' or f.frozen_at is not null then
    raise exception 'Submission is only available during reconciliation';
  end if;
  if f.revision<>p_expected_revision then
    raise exception using errcode='40001',message='Team changed; refresh before submitting';
  end if;
  select count(*) filter (where r.quantity_units is null),
    jsonb_agg(jsonb_build_object('brand_code',r.brand_code,'quantity_units',r.quantity_units,
      'resolution',r.resolution,'resolved_by',r.resolved_by))
    into pending,results from private.team_resolutions(p_team) r;
  if results is null then raise exception 'No counted products to submit'; end if;
  if pending>0 then
    raise exception using message='Every item must be resolved before submitting',detail=pending||' item(s) pending';
  end if;
  update public.team_flows set phase='admin_review',revision=revision+1 where team_id=p_team;
  v_id:=private.build_team_result_snapshot(p_team,f.revision+1,actor.id,results);
  command.receipt:=jsonb_build_object('versionId',v_id,'revision',(f.revision+1)::text);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;
revoke all on function private.submit_team_reconciliation(uuid,bigint,uuid) from public,anon,authenticated,service_role;

create function public.save_team_reconciliation(p_team uuid,p_command uuid,p_brand text,p_expected_revision bigint,
  p_pallets integer,p_cases integer,p_units integer,p_weight boolean,
  p_bpu integer,p_pallet_size integer,p_weight_avg numeric,p_tare numeric,p_weighing jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_team_reconciliation(p_team,p_command,p_brand,p_expected_revision,p_pallets,p_cases,p_units,
    p_weight,p_bpu,p_pallet_size,p_weight_avg,p_tare,p_weighing);
$$;
create function public.submit_team_reconciliation(p_team uuid,p_expected_revision bigint,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.submit_team_reconciliation(p_team,p_expected_revision,p_command);
$$;
revoke all on function
  public.save_team_reconciliation(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb),
  public.submit_team_reconciliation(uuid,bigint,uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  public.save_team_reconciliation(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb),
  private.save_team_reconciliation(uuid,uuid,text,bigint,integer,integer,integer,boolean,integer,integer,numeric,numeric,jsonb),
  public.submit_team_reconciliation(uuid,bigint,uuid),private.submit_team_reconciliation(uuid,bigint,uuid)
  to authenticated;
alter publication supabase_realtime add table public.team_reconciliations;

commit;
