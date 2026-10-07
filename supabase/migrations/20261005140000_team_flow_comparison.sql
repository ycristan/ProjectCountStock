-- Block 6: comparison after all individual finishes are accepted (R04/R05, revised 2026-10-05).
-- Comparison is computed, not stored: counts are frozen once the team leaves 'counting'.
-- Only the Independent's choice on items within weight tolerance is stored (append-only).
begin;

create table public.team_item_decisions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  brand_code text not null references public.inventory_items(brand_code) on delete restrict,
  decision text not null check (decision in ('accept_value','reconcile')),
  chosen_record_id uuid references public.team_count_records(id) on delete restrict,
  quantity_units bigint check (quantity_units >= 0),
  decided_by uuid not null,
  flow_revision bigint not null,
  command_id uuid not null,
  decided_at timestamptz not null default clock_timestamp(),
  foreign key (team_id,decided_by) references public.team_memberships(team_id,id) on delete restrict,
  unique (team_id,command_id),
  check ((decision='accept_value') = (chosen_record_id is not null and quantity_units is not null))
);
create index team_item_decisions_item_idx on public.team_item_decisions(team_id,brand_code,decided_at);
create index team_item_decisions_actor_idx on public.team_item_decisions(team_id,decided_by);
create index team_item_decisions_record_idx on public.team_item_decisions(chosen_record_id);
alter table public.team_item_decisions enable row level security;
revoke all on public.team_item_decisions from public,anon,authenticated,service_role;
grant select on public.team_item_decisions to authenticated,service_role;
create policy team_item_decision_read on public.team_item_decisions for select to authenticated
  using (private.team_flow_visible(team_id,true));

create function private.guard_team_item_decision()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Item decisions are append-only'; end; $$;
revoke all on function private.guard_team_item_decision() from public,anon,authenticated,service_role;
create trigger guard_team_item_decision before update or delete on public.team_item_decisions
for each row execute function private.guard_team_item_decision();

-- One row per product counted by the team. Required records: every active counting position.
-- Order (R04): missing record -> reconcile; all equal -> equal (any method);
-- all by weight and max-min <= greatest(1, floor(2% of max)) -> tolerance; otherwise reconcile.
create function private.team_comparison(p_team uuid)
returns table(brand_code text, status text, tolerance_limit bigint, cells jsonb)
language sql stable security invoker set search_path = ''
as $$
  with required as (
    select a.slot_id, s.ordinal, m.id membership_id
    from public.team_slot_assignments a
    join public.team_count_slots s on s.team_id=a.team_id and s.id=a.slot_id
    join public.team_memberships m on m.team_id=a.team_id and m.id=a.membership_id
    where a.team_id=p_team and a.ended_at is null and m.role='counter'
  ), cell as (
    select b.brand_code, q.ordinal, q.membership_id, r.id record_id, r.quantity_units, r.method
    from (select distinct c.brand_code from public.team_count_records c where c.team_id=p_team) b
    cross join required q
    left join public.team_count_records r
      on r.team_id=p_team and r.slot_id=q.slot_id and r.brand_code=b.brand_code
  )
  select c.brand_code,
    case
      when bool_or(c.record_id is null) then 'reconcile'
      when min(c.quantity_units)=max(c.quantity_units) then 'equal'
      when bool_and(c.method='weight')
        and max(c.quantity_units)-min(c.quantity_units) <= greatest(1, max(c.quantity_units)*2/100) then 'tolerance'
      else 'reconcile'
    end,
    greatest(1, coalesce(max(c.quantity_units),0)*2/100),
    jsonb_agg(jsonb_build_object('membershipId',c.membership_id,'recordId',c.record_id,
      'quantity',c.quantity_units::text,'method',c.method) order by c.ordinal)
  from cell c group by c.brand_code;
$$;
revoke all on function private.team_comparison(uuid) from public,anon,authenticated,service_role;

-- Independent and admin only: counters stay blind to each other.
create function private.read_team_comparison(p_team uuid)
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
        order by d.decided_at desc, d.id desc limit 1))
    order by c.brand_code) from private.team_comparison(p_team) c),'[]'::jsonb);
end;
$$;
revoke all on function private.read_team_comparison(uuid) from public,anon,authenticated,service_role;

-- R05: inside tolerance the Independent picks which recorded value is official, or asks to reconcile.
create function private.decide_team_item(p_team uuid,p_brand text,p_record uuid,p_expected_revision bigint,p_command uuid)
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
revoke all on function private.decide_team_item(uuid,text,uuid,bigint,uuid) from public,anon,authenticated,service_role;

create function public.read_team_comparison(p_team uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_team_comparison(p_team); $$;
create function public.decide_team_item(p_team uuid,p_brand text,p_record uuid,p_expected_revision bigint,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.decide_team_item(p_team,p_brand,p_record,p_expected_revision,p_command);
$$;
revoke all on function public.read_team_comparison(uuid), public.decide_team_item(uuid,text,uuid,bigint,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_team_comparison(uuid), private.read_team_comparison(uuid),
  public.decide_team_item(uuid,text,uuid,bigint,uuid), private.decide_team_item(uuid,text,uuid,bigint,uuid)
  to authenticated;
alter publication supabase_realtime add table public.team_item_decisions;

commit;
