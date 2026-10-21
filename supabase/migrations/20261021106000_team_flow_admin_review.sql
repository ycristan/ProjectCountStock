-- Block 8 (R07): admin review of the sealed team result.
-- Accept moves the team to signature collection with that sealed version.
-- Return reopens reconciliation for selected products the team counted; the
-- Independent recounts them and submits again. Reviews and rounds are append-only.
begin;

create table public.team_admin_reviews (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  version_id uuid not null,
  decision text not null check (decision in ('accept','return')),
  -- Admin auth identity: admins are not team members.
  decided_by uuid not null references auth.users(id) on delete restrict,
  flow_revision bigint not null,
  decided_at timestamptz not null default clock_timestamp(),
  unique(team_id,id),
  foreign key(team_id,version_id) references public.team_result_versions(team_id,id) on delete restrict
);
create index team_admin_reviews_team_idx on public.team_admin_reviews(team_id,decided_at);
create index team_admin_reviews_version_idx on public.team_admin_reviews(team_id,version_id);
create index team_admin_reviews_actor_idx on public.team_admin_reviews(decided_by);

create table public.team_recount_items (
  review_id uuid not null,
  team_id uuid not null,
  brand_code text not null references public.inventory_items(brand_code) on delete restrict,
  primary key(review_id,brand_code),
  foreign key(team_id,review_id) references public.team_admin_reviews(team_id,id) on delete restrict
);
create index team_recount_items_team_idx on public.team_recount_items(team_id,brand_code);
create index team_recount_items_brand_idx on public.team_recount_items(brand_code);

-- A recounted value belongs to the round that asked for it.
alter table public.team_reconciliations add column recount_review_id uuid;
alter table public.team_reconciliations add constraint team_reconciliation_round_fk
  foreign key(team_id,recount_review_id) references public.team_admin_reviews(team_id,id) on delete restrict;
create index team_reconciliations_round_idx on public.team_reconciliations(team_id,recount_review_id);

do $$
declare tab text;
begin
  foreach tab in array array['team_admin_reviews','team_recount_items'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to authenticated,service_role',tab);
    execute format('create policy team_review_monitor_read on public.%I for select to authenticated using (private.team_flow_visible(team_id,true))',tab);
  end loop;
end;
$$;

create function private.guard_team_review_history()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Admin reviews are append-only'; end; $$;
revoke all on function private.guard_team_review_history() from public,anon,authenticated,service_role;
create trigger guard_team_admin_review before update or delete on public.team_admin_reviews
for each row execute function private.guard_team_review_history();
create trigger guard_team_recount_item before update or delete on public.team_recount_items
for each row execute function private.guard_team_review_history();

-- Open recount round: the team is reconciling again after the latest return.
create function private.team_open_round(p_team uuid)
returns uuid language sql stable security invoker set search_path = ''
as $$
  select v.id from public.team_admin_reviews v
  join public.team_flows f on f.team_id=v.team_id
  where v.team_id=p_team and v.decision='return' and f.phase='reconciling'
  order by v.decided_at desc,v.id desc limit 1;
$$;
revoke all on function private.team_open_round(uuid) from public,anon,authenticated,service_role;

-- Latest round that selected each product; its recount is the official value.
create function private.team_last_round(p_team uuid)
returns table(brand_code text, review_id uuid, rounds bigint)
language sql stable security invoker set search_path = ''
as $$
  select distinct on (i.brand_code) i.brand_code,i.review_id,
    count(*) over (partition by i.brand_code)
  from public.team_recount_items i join public.team_admin_reviews v on v.id=i.review_id
  where i.team_id=p_team
  order by i.brand_code,v.decided_at desc,v.id desc;
$$;
revoke all on function private.team_last_round(uuid) from public,anon,authenticated,service_role;

-- Recounted products: official value is the latest recount of their latest round
-- (pending until it exists). Products never returned keep the block 7 resolution.
create or replace function private.team_resolutions(p_team uuid)
returns table(brand_code text, status text, quantity_units bigint, resolution text, resolved_by uuid)
language sql stable security invoker set search_path = ''
as $$
  with d as (
    select distinct on (x.brand_code) x.brand_code,x.decision,x.quantity_units,x.decided_by
    from public.team_item_decisions x where x.team_id=p_team
    order by x.brand_code,x.decided_at desc,x.id desc
  ), r as (
    select distinct on (x.brand_code) x.brand_code,x.quantity_units,x.reconciled_by
    from public.team_reconciliations x where x.team_id=p_team and x.recount_review_id is null
    order by x.brand_code,x.recorded_at desc,x.id desc
  ), rc as (
    select l.brand_code,x.quantity_units,x.reconciled_by
    from private.team_last_round(p_team) l
    left join lateral (select y.quantity_units,y.reconciled_by from public.team_reconciliations y
      where y.team_id=p_team and y.brand_code=l.brand_code and y.recount_review_id=l.review_id
      order by y.recorded_at desc,y.id desc limit 1) x on true
  )
  select c.brand_code,c.status,
    case when rc.brand_code is not null then rc.quantity_units
      when c.status='equal' then (c.cells->0->>'quantity')::bigint
      when c.status='tolerance' and d.decision='accept_value' then d.quantity_units
      when c.status='reconcile' or d.decision='reconcile' then r.quantity_units end,
    case when rc.brand_code is not null then 'reconciled'
      when c.status='equal' then 'equal'
      when c.status='tolerance' and d.decision='accept_value' then 'weight_tolerance'
      else 'reconciled' end,
    case when rc.brand_code is not null then rc.reconciled_by
      when c.status='tolerance' and d.decision='accept_value' then d.decided_by
      when c.status='reconcile' or d.decision='reconcile' then r.reconciled_by end
  from private.team_comparison(p_team) c
  left join d on d.brand_code=c.brand_code
  left join r on r.brand_code=c.brand_code
  left join rc on rc.brand_code=c.brand_code;
$$;

-- Comparison rows also say whether the product is in the open round and which
-- reconciliation is current (the latest round's recount once it was returned).
create or replace function private.read_team_comparison(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare f public.team_flows; open_round uuid;
begin
  if not private.team_flow_visible(p_team,true) then
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

-- Admin decisions and rounds, oldest first, for the monitor history.
create function private.read_team_reviews(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'decision',v.decision,
      'decidedAt',v.decided_at,'versionId',v.version_id,'round',v.round,
      'brands',(select coalesce(jsonb_agg(i.brand_code order by i.brand_code),'[]'::jsonb)
        from public.team_recount_items i where i.review_id=v.id))
    order by v.decided_at,v.id)
    from (select x.*,case when x.decision='return' then count(*) filter (where x.decision='return')
        over (order by x.decided_at,x.id) end round
      from public.team_admin_reviews x where x.team_id=p_team) v),'[]'::jsonb);
end;
$$;
revoke all on function private.read_team_reviews(uuid) from public,anon,authenticated,service_role;

-- R07: one admin decision per sealed version. Revision check under the team lock
-- makes simultaneous decisions by two admins fail instead of overwriting (T23).
create function private.review_team_result(p_team uuid,p_expected_revision bigint,p_command uuid,
  p_accept boolean,p_brands text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; v public.team_result_versions; command private.team_count_commands;
  payload jsonb; brands text[]; v_review uuid;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Review not authorized';
  end if;
  if p_command is null or p_expected_revision is null or p_accept is null then
    raise exception using errcode='22023',message='Invalid review';
  end if;
  select array_agg(distinct b order by b) into brands from unnest(p_brands) b where b is not null;
  if p_accept and brands is not null then
    raise exception using errcode='22023',message='Accepting takes no product selection';
  end if;
  if not p_accept and brands is null then
    raise exception using errcode='22023',message='Select at least one product to recount';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  if f.team_id is null then raise exception using errcode='42501',message='Review not authorized'; end if;
  payload:=jsonb_build_array('review',p_expected_revision,p_accept,to_jsonb(brands));
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    return command.receipt;
  end if;
  if f.phase<>'admin_review' or f.frozen_at is not null then
    raise exception 'Review is only available after submission';
  end if;
  if f.revision<>p_expected_revision then
    raise exception using errcode='40001',message='Team changed; refresh before reviewing';
  end if;
  select * into strict v from public.team_result_versions
    where team_id=p_team and source_revision=f.revision and sealed_at is not null;
  if not p_accept and exists (select 1 from unnest(brands) b where not exists (
      select 1 from public.team_result_items i where i.version_id=v.id and i.brand_code=b)) then
    raise exception using errcode='22023',message='Only products counted by this team can be returned';
  end if;
  insert into public.team_admin_reviews(team_id,version_id,decision,decided_by,flow_revision)
    values(p_team,v.id,case when p_accept then 'accept' else 'return' end,auth.uid(),f.revision)
    returning id into v_review;
  if p_accept then
    update public.team_flows set phase='signing',result_version_id=v.id,revision=revision+1 where team_id=p_team;
  else
    insert into public.team_recount_items(review_id,team_id,brand_code)
      select v_review,p_team,b from unnest(brands) b;
    update public.team_flows set phase='reconciling',revision=revision+1 where team_id=p_team;
  end if;
  command.receipt:=jsonb_build_object('reviewId',v_review,'revision',(f.revision+1)::text,
    'phase',case when p_accept then 'signing' else 'reconciling' end);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;
revoke all on function private.review_team_result(uuid,bigint,uuid,boolean,text[]) from public,anon,authenticated,service_role;

-- Block 7 command with the R07 round rule: during a recount round only the
-- selected products take a value, and it is attached to that round.
create or replace function private.save_team_reconciliation(
  p_team uuid,p_command uuid,p_brand text,p_expected_revision bigint,
  p_pallets integer,p_cases integer,p_units integer,p_weight boolean,
  p_bpu integer,p_pallet_size integer,p_weight_avg numeric,p_tare numeric,p_weighing jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; item public.inventory_items;
  command private.team_count_commands; payload jsonb; wh uuid; tare numeric; v_weighing jsonb;
  c record; latest text; saved public.team_reconciliations; open_round uuid;
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
  open_round:=private.team_open_round(p_team);
  if open_round is not null then
    if not exists(select 1 from public.team_recount_items where review_id=open_round and brand_code=p_brand) then
      raise exception 'Item is not in the recount round';
    end if;
  else
    select * into c from private.team_comparison(p_team) x where x.brand_code=p_brand;
    select d.decision into latest from public.team_item_decisions d where d.team_id=p_team and d.brand_code=p_brand
      order by d.decided_at desc,d.id desc limit 1;
    if c.brand_code is null or c.status='equal' or (c.status='tolerance' and latest is distinct from 'reconcile') then
      raise exception 'Item does not need reconciliation';
    end if;
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
    bpu_at_entry,method,weighing,reconciled_by,flow_revision,recount_review_id)
  values(p_team,p_brand,p_pallets,p_cases,p_units,coalesce(item.pallet_size,0),item.bpu,
    case when p_weight then 'weight' else 'manual' end,v_weighing,actor.id,f.revision,open_round)
  returning * into saved;
  command.receipt:=jsonb_build_object('quantity',saved.quantity_units::text,
    'final_cases',saved.quantity_units/item.bpu,'final_units',saved.quantity_units%item.bpu,'brand_name',item.brand_name);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;

-- Products not selected in a round keep their earlier resolution: no new
-- tolerance choices while a round is open.
create or replace function private.decide_team_item(p_team uuid,p_brand text,p_record uuid,p_expected_revision bigint,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; d public.team_item_decisions;
  c record; chosen bigint;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Decision not authorized';
  end if;
  if p_brand is null or p_command is null or p_expected_revision is null then
    raise exception using errcode='22023',message='Invalid decision';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and role='independent' and departed_at is null and access_revoked_at is null;
  if actor.id is null or f.team_id is null then
    raise exception using errcode='42501',message='Decision not authorized';
  end if;
  select * into d from public.team_item_decisions where team_id=p_team and command_id=p_command;
  if d.id is not null then
    if (d.brand_code,d.chosen_record_id,d.decided_by) is distinct from (p_brand,p_record,actor.id) then
      raise exception using errcode='22023',message='Command identifier already used';
    end if;
    return jsonb_build_object('decision',d.decision,'quantity',d.quantity_units::text);
  end if;
  if f.phase <> 'reconciling' or f.frozen_at is not null then
    raise exception 'Decisions are only available during reconciliation';
  end if;
  if f.revision <> p_expected_revision then
    raise exception using errcode='40001',message='Team changed; refresh before deciding';
  end if;
  if private.team_open_round(p_team) is not null then
    raise exception 'Decisions are closed during a recount round';
  end if;
  select * into c from private.team_comparison(p_team) x where x.brand_code=p_brand;
  if c.brand_code is null or c.status <> 'tolerance' then
    raise exception 'Only items within weight tolerance take this decision';
  end if;
  if p_record is not null then
    select (x->>'quantity')::bigint into chosen from jsonb_array_elements(c.cells) x
      where (x->>'recordId')::uuid = p_record;
    if chosen is null then raise exception using errcode='22023',message='Value is not a count of this item'; end if;
  end if;
  insert into public.team_item_decisions(team_id,brand_code,decision,chosen_record_id,quantity_units,decided_by,flow_revision,command_id)
    values(p_team,p_brand,case when p_record is null then 'reconcile' else 'accept_value' end,
      p_record,chosen,actor.id,f.revision,p_command)
    returning * into d;
  return jsonb_build_object('decision',d.decision,'quantity',d.quantity_units::text);
end;
$$;

create function public.review_team_result(p_team uuid,p_expected_revision bigint,p_command uuid,
  p_accept boolean,p_brands text[] default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.review_team_result(p_team,p_expected_revision,p_command,p_accept,p_brands);
$$;
create function public.read_team_reviews(p_team uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_team_reviews(p_team); $$;
revoke all on function public.review_team_result(uuid,bigint,uuid,boolean,text[]),public.read_team_reviews(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.review_team_result(uuid,bigint,uuid,boolean,text[]),
  private.review_team_result(uuid,bigint,uuid,boolean,text[]),
  public.read_team_reviews(uuid),private.read_team_reviews(uuid) to authenticated;
alter publication supabase_realtime add table public.team_admin_reviews;

commit;
