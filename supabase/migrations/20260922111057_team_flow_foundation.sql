-- Delivery 2 foundation. Not activated by application routes.
-- New teams opt in through team_flows in a later reviewed delivery.
-- No backfill, identity rewrite, PIN change or conversion of active/closed legacy teams.
begin;

create table public.team_flows (
  team_id uuid primary key references public.teams(id) on delete restrict,
  phase text not null default 'setup'
    check (phase in ('setup','counting','reconciling','admin_review','signing','closed')),
  revision bigint not null default 0 check (revision >= 0),
  frozen_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (frozen_at is null or phase in ('signing','closed')),
  check ((phase = 'closed') = (closed_at is not null)),
  check (closed_at is null or (frozen_at is not null and closed_at >= frozen_at))
);

-- Auth identity is the person; membership is the role in ONE team.
-- Names are snapshots for attribution, not authorization. PINs never live here.
create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  role text not null check (role in ('counter','independent')),
  display_order integer not null check (display_order >= 0),
  finish_state text not null default 'counting'
    check (finish_state in ('counting','requested','accepted')),
  joined_at timestamptz not null default now(),
  departed_at timestamptz,
  access_revoked_at timestamptz,
  unique (team_id,id),
  unique (team_id,user_id),
  unique (team_id,display_order),
  check (departed_at is null or departed_at >= joined_at),
  check (access_revoked_at is null or access_revoked_at >= joined_at)
);
create index team_memberships_user_idx on public.team_memberships(user_id,team_id);
create unique index team_one_active_independent on public.team_memberships(team_id)
where role = 'independent' and departed_at is null;

-- Logical counting positions outlive the people assigned to them.
-- Assignment intervals preserve attribution when a person is replaced.
create table public.team_count_slots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  unique (team_id,id),
  unique (team_id,ordinal)
);
create table public.team_slot_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  slot_id uuid not null,
  membership_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (team_id,slot_id) references public.team_count_slots(team_id,id) on delete restrict,
  foreign key (team_id,membership_id) references public.team_memberships(team_id,id) on delete restrict,
  unique (team_id,id),
  check (ended_at is null or ended_at >= started_at)
);
create index team_assignment_member_idx on public.team_slot_assignments(team_id,membership_id);
create unique index team_slot_active_assignment on public.team_slot_assignments(team_id,slot_id)
where ended_at is null;
create unique index team_member_active_assignment on public.team_slot_assignments(team_id,membership_id)
where ended_at is null;

-- Canonical units and method support N participants without contador_3 columns.
-- Preserve physical components for approved BPU corrections; canonical units use
-- the same arithmetic as legacy convert_count. Weight already arrives converted
-- into these components today; keep its method marker for comparison.
-- This table is NOT yet a client-write API.
create table public.team_count_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  assignment_id uuid not null,
  slot_id uuid not null,
  brand_code text not null references public.inventory_items(brand_code) on delete restrict,
  pallets integer not null default 0 check (pallets >= 0),
  cases integer not null default 0 check (cases >= 0),
  units integer not null default 0 check (units >= 0),
  pallet_size_at_entry integer not null default 0 check (pallet_size_at_entry >= 0),
  quantity_units bigint generated always as
    ((pallets::bigint * pallet_size_at_entry + cases) * bpu_at_entry + units) stored,
  check (pallets = 0 or pallet_size_at_entry > 0),
  method text not null check (method in ('manual','weight')),
  bpu_at_entry integer not null check (bpu_at_entry >= 1),
  revision bigint not null default 0 check (revision >= 0),
  recorded_at timestamptz not null default now(),
  foreign key (team_id,assignment_id) references public.team_slot_assignments(team_id,id) on delete restrict,
  foreign key (team_id,slot_id) references public.team_count_slots(team_id,id) on delete restrict,
  unique (team_id,slot_id,brand_code)
);
create index team_records_assignment_idx on public.team_count_records(team_id,assignment_id);
create index team_records_brand_idx on public.team_count_records(brand_code);

-- Revisions preserve prior quantities and authorship, not mutable Auth metadata.
create table public.team_count_record_history (
  record_id uuid not null references public.team_count_records(id) on delete restrict,
  revision bigint not null,
  quantity_units bigint not null,
  pallets integer not null,
  cases integer not null,
  units integer not null,
  pallet_size_at_entry integer not null,
  method text not null,
  bpu_at_entry integer not null,
  recorded_at timestamptz not null,
  superseded_at timestamptz not null default now(),
  primary key (record_id,revision)
);

create function private.team_flow_visible(p_team uuid, p_monitor boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_admin() or exists (
      select 1 from public.team_memberships m
      join public.team_flows f on f.team_id=m.team_id
      join public.teams t on t.id=f.team_id
      join public.count_sessions s on s.id=t.session_id
      where m.team_id=p_team and m.user_id=auth.uid()
        and m.departed_at is null and m.access_revoked_at is null
        and f.phase <> 'closed' and s.status <> 'fechada'
        and (not p_monitor or m.role='independent')
    )
  );
$$;
revoke all on function private.team_flow_visible(uuid,boolean) from public,anon;
grant execute on function private.team_flow_visible(uuid,boolean) to authenticated;

create function private.team_record_visible(p_team uuid, p_assignment uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    private.team_flow_visible(p_team,true)
    or (private.team_flow_visible(p_team,false) and exists (
      select 1 from public.team_slot_assignments a
      join public.team_memberships m on m.team_id=a.team_id and m.id=a.membership_id
      where a.team_id=p_team and a.id=p_assignment and m.user_id=auth.uid()
    ))
  );
$$;
revoke all on function private.team_record_visible(uuid,uuid) from public,anon;
grant execute on function private.team_record_visible(uuid,uuid) to authenticated;

-- Least privilege: even service_role has no direct writes in this foundation.
-- Subsequent deliveries add scoped transactional commands, not broad table grants.
do $$
declare tab text;
begin
  foreach tab in array array['team_flows','team_memberships','team_count_slots',
    'team_slot_assignments','team_count_records','team_count_record_history'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to authenticated,service_role',tab);
  end loop;
end;
$$;
create policy team_flow_read on public.team_flows for select to authenticated
using (private.team_flow_visible(team_id,false));
create policy team_membership_read on public.team_memberships for select to authenticated
using (private.team_flow_visible(team_id,false));
create policy team_slot_read on public.team_count_slots for select to authenticated
using (private.team_flow_visible(team_id,false));
create policy team_assignment_read on public.team_slot_assignments for select to authenticated
using (private.team_flow_visible(team_id,false));
create policy team_record_read on public.team_count_records for select to authenticated
using (private.team_record_visible(team_id,assignment_id));
create policy team_record_history_read on public.team_count_record_history for select to authenticated
using (exists (select 1 from public.team_count_records r where r.id=record_id
  and private.team_record_visible(r.team_id,r.assignment_id)));

-- Child writes serialize with phase/freeze changes on this team only.
create function private.guard_team_flow_child()
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
      insert into public.team_count_record_history(record_id,revision,quantity_units,pallets,cases,units,pallet_size_at_entry,method,bpu_at_entry,recorded_at)
      values(old.id,old.revision,old.quantity_units,old.pallets,old.cases,old.units,old.pallet_size_at_entry,old.method,old.bpu_at_entry,old.recorded_at);
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
revoke all on function private.guard_team_flow_child() from public,anon,authenticated,service_role;

do $$
declare tab text;
begin
  foreach tab in array array['team_memberships','team_count_slots','team_slot_assignments','team_count_records'] loop
    execute format('create trigger guard_team_flow_child before insert or update or delete on public.%I for each row execute function private.guard_team_flow_child()',tab);
  end loop;
end;
$$;

create function private.guard_team_flow()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op='DELETE' then raise exception 'Team flow cannot be deleted'; end if;
  if tg_op='INSERT' then
    if new.phase <> 'setup' or new.revision <> 0 or new.frozen_at is not null then
      raise exception 'Team flow must start in setup';
    end if;
    if not exists (select 1 from public.teams t join public.count_sessions s on s.id=t.session_id
      where t.id=new.team_id and s.status <> 'fechada')
      or exists (select 1 from public.counter_accounts where team_id=new.team_id)
      or exists (select 1 from public.count_entries where team_id=new.team_id)
      or exists (select 1 from public.reconciliation_items where team_id=new.team_id) then
      raise exception 'Legacy or closed team cannot be activated silently';
    end if;
    return new;
  end if;
  if (new.team_id,new.created_at) is distinct from (old.team_id,old.created_at) then
    raise exception 'Team flow identity cannot change';
  end if;
  if old.phase='closed' then raise exception 'Closed team is immutable'; end if;
  if new.revision <> old.revision+1 then raise exception 'Team revision must advance by one'; end if;
  if old.frozen_at is not null and (
    new.frozen_at is distinct from old.frozen_at or new.phase not in ('signing','closed')
  ) then raise exception 'First confirmation cannot be undone'; end if;
  if new.phase <> old.phase and not (
    (old.phase='setup' and new.phase='counting') or
    (old.phase='counting' and new.phase='reconciling') or
    (old.phase='reconciling' and new.phase='admin_review') or
    (old.phase='admin_review' and new.phase in ('reconciling','signing')) or
    (old.phase='signing' and new.phase='admin_review' and old.frozen_at is null) or
    (old.phase='signing' and new.phase='closed' and old.frozen_at is not null)
  ) then raise exception 'Invalid team phase transition'; end if;
  if old.phase='setup' and new.phase='counting' then
    if (select count(*) from public.team_memberships where team_id=new.team_id and role='independent'
      and departed_at is null and access_revoked_at is null) <> 1
      or (select count(*) from public.team_count_slots where team_id=new.team_id) < 2
      or exists (select 1 from public.team_memberships m
        where m.team_id=new.team_id and m.role='counter' and m.departed_at is null and m.access_revoked_at is null
        and not exists (select 1 from public.team_slot_assignments a
          where a.team_id=m.team_id and a.membership_id=m.id and a.ended_at is null))
      or exists (select 1 from public.team_count_slots s where s.team_id=new.team_id and not exists (
        select 1 from public.team_slot_assignments a join public.team_memberships m on m.id=a.membership_id
        where a.team_id=s.team_id and a.slot_id=s.id and a.ended_at is null
          and m.departed_at is null and m.access_revoked_at is null
      )) then raise exception 'Team requires independent and assigned counting positions'; end if;
  end if;
  if old.phase='counting' and new.phase='reconciling' and exists (
    select 1 from public.team_slot_assignments a join public.team_memberships m on m.id=a.membership_id
    where a.team_id=new.team_id and a.ended_at is null and m.departed_at is null
      and m.finish_state <> 'accepted'
  ) then raise exception 'All required individual finishes must be accepted'; end if;
  -- Reconciliation completeness and confirmation evidence are enforced by the
  -- scoped commands in deliveries 4/8 before any client write capability is added.
  return new;
end;
$$;
revoke all on function private.guard_team_flow() from public,anon,authenticated,service_role;
create trigger guard_team_flow before insert or update or delete on public.team_flows
for each row execute function private.guard_team_flow();

create function private.guard_team_record_history()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Count history is append-only';
end;
$$;
revoke all on function private.guard_team_record_history() from public,anon,authenticated,service_role;
create trigger guard_team_record_history before update or delete on public.team_count_record_history
for each row execute function private.guard_team_record_history();

-- Legacy writers must never populate a version-2 team or close its session.
create function private.guard_legacy_team_flow_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare target_id uuid;
begin
  if tg_table_name='count_sessions' then
    target_id := old.id;
    if (tg_op='DELETE' or new.status is distinct from old.status) and exists (
      select 1 from public.team_flows f join public.teams t on t.id=f.team_id where t.session_id=target_id
    ) then raise exception 'Use the versioned team session workflow'; end if;
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
revoke all on function private.guard_legacy_team_flow_write() from public,anon,authenticated,service_role;
create trigger guard_legacy_team_flow_write before insert or update or delete on public.counter_accounts
for each row execute function private.guard_legacy_team_flow_write();
create trigger guard_legacy_team_flow_write before insert or update or delete on public.count_entries
for each row execute function private.guard_legacy_team_flow_write();
create trigger guard_legacy_team_flow_write before insert or update or delete on public.reconciliation_items
for each row execute function private.guard_legacy_team_flow_write();
create trigger guard_legacy_team_flow_write before update or delete on public.count_sessions
for each row execute function private.guard_legacy_team_flow_write();


-- Normal individual-finish commands. No creation/count/reconciliation/signature
-- command is exposed yet. Departures/substitution require delivery 6 commands.
create table public.team_finish_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  command_id uuid not null,
  actor_membership_id uuid not null,
  subject_membership_id uuid not null,
  action text not null check (action in ('request','accept','reject')),
  expected_revision bigint not null check (expected_revision >= 0),
  resulting_revision bigint not null check (resulting_revision = expected_revision + 1),
  resulting_state text not null check (resulting_state in ('requested','accepted','counting')),
  resulting_phase text not null check (resulting_phase in ('counting','reconciling')),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (team_id,actor_membership_id) references public.team_memberships(team_id,id) on delete restrict,
  foreign key (team_id,subject_membership_id) references public.team_memberships(team_id,id) on delete restrict,
  unique(team_id,command_id),
  unique(team_id,resulting_revision)
);
create index team_finish_actor_idx on public.team_finish_events(team_id,actor_membership_id);
create index team_finish_subject_idx on public.team_finish_events(team_id,subject_membership_id);
alter table public.team_finish_events enable row level security;
revoke all on public.team_finish_events from public,anon,authenticated,service_role;
grant select on public.team_finish_events to authenticated,service_role;
create policy team_finish_event_read on public.team_finish_events for select to authenticated
using (
  private.team_flow_visible(team_id,true)
  or (private.team_flow_visible(team_id,false) and exists (
    select 1 from public.team_memberships m
    where m.team_id=team_finish_events.team_id and m.id=subject_membership_id and m.user_id=auth.uid()
  ))
);
create function private.guard_team_finish_event()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Finish events are append-only';
end;
$$;
revoke all on function private.guard_team_finish_event() from public,anon,authenticated,service_role;
create trigger guard_team_finish_event before update or delete on public.team_finish_events
for each row execute function private.guard_team_finish_event();

-- Privilege elevation is limited to this checked operation; clients never get
-- UPDATE on memberships/flows or INSERT on the immutable event ledger.
create function private.team_finish_command(
  p_team uuid, p_subject uuid, p_action text, p_expected_revision bigint, p_command uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  f public.team_flows;
  actor public.team_memberships;
  subject public.team_memberships;
  event public.team_finish_events;
  next_state text;
  next_phase text;
begin
  if auth.uid() is null or private.is_admin() then
    raise exception using errcode='42501', message='Finish operation not authorized';
  end if;
  if p_team is null or p_subject is null or p_command is null
    or p_expected_revision is null or p_expected_revision < 0
    or p_action is null or p_action not in ('request','accept','reject') then
    raise exception using errcode='22023', message='Invalid finish command';
  end if;
  -- Check membership before taking the lock; recheck after waiting for it.
  if not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501', message='Finish operation not authorized';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships
    where team_id=p_team and user_id=auth.uid()
      and departed_at is null and access_revoked_at is null;
  if actor.id is null or f.team_id is null or f.phase='closed'
    or not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501', message='Finish operation not authorized';
  end if;
  select * into subject from public.team_memberships
    where team_id=p_team and id=p_subject and role='counter'
      and departed_at is null and access_revoked_at is null;
  if subject.id is null
    or (p_action='request' and (actor.id <> subject.id or actor.role <> 'counter'))
    or (p_action <> 'request' and (actor.role <> 'independent' or actor.id=subject.id)) then
    raise exception using errcode='42501', message='Finish operation not authorized';
  end if;
  -- A replay returns the original receipt, not a second transition. Identity and
  -- current access are checked first, even if this command succeeded previously.
  select * into event from public.team_finish_events where team_id=p_team and command_id=p_command;
  if event.id is not null then
    if (event.actor_membership_id,event.subject_membership_id,event.action,event.expected_revision)
      is distinct from (actor.id,p_subject,p_action,p_expected_revision) then
      raise exception using errcode='22023', message='Command identifier already used';
    end if;
  else
    if f.frozen_at is not null or f.phase <> 'counting' then
      raise exception 'Individual finish is unavailable in this phase';
    end if;
    if f.revision <> p_expected_revision then
      raise exception using errcode='40001', message='Team changed; refresh before deciding';
    end if;
    -- Fail closed until exceptional authority/assignment is implemented.
    if exists(select 1 from public.team_memberships where team_id=p_team
        and (departed_at is not null or access_revoked_at is not null))
      or exists(select 1 from public.team_slot_assignments where team_id=p_team and ended_at is not null)
      or not exists(select 1 from public.team_slot_assignments
        where team_id=p_team and membership_id=subject.id and ended_at is null) then
      raise exception 'Exceptional finish workflow is not available yet';
    end if;
    if (p_action='request' and subject.finish_state <> 'counting')
      or (p_action <> 'request' and subject.finish_state <> 'requested') then
      raise exception 'No matching individual finish transition';
    end if;
    next_state := case p_action when 'request' then 'requested' when 'accept' then 'accepted' else 'counting' end;
    update public.team_memberships set finish_state=next_state where id=subject.id;
    next_phase := 'counting';
    if p_action='accept' and not exists (
      select 1 from public.team_slot_assignments a
      join public.team_memberships m on m.team_id=a.team_id and m.id=a.membership_id
      where a.team_id=p_team and a.ended_at is null and m.finish_state <> 'accepted'
    ) then next_phase := 'reconciling'; end if;
    update public.team_flows set phase=next_phase,revision=revision+1 where team_id=p_team;
    insert into public.team_finish_events(
      team_id,command_id,actor_membership_id,subject_membership_id,action,
      expected_revision,resulting_revision,resulting_state,resulting_phase
    ) values(p_team,p_command,actor.id,subject.id,p_action,
      p_expected_revision,p_expected_revision+1,next_state,next_phase)
    returning * into event;
  end if;
  return jsonb_build_object('event_id',event.id,'team_id',event.team_id,
    'membership_id',event.subject_membership_id,'revision',event.resulting_revision,
    'finish_state',event.resulting_state,'phase',event.resulting_phase);
end;
$$;
revoke all on function private.team_finish_command(uuid,uuid,text,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function private.team_finish_command(uuid,uuid,text,bigint,uuid) to authenticated;

create function public.request_team_finish(p_team uuid,p_membership uuid,p_expected_revision bigint,p_command uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.team_finish_command(p_team,p_membership,'request',p_expected_revision,p_command);
$$;
create function public.decide_team_finish(p_team uuid,p_membership uuid,p_accept boolean,p_expected_revision bigint,p_command uuid)
returns jsonb language sql security invoker set search_path = ''
as $$
  select private.team_finish_command(p_team,p_membership,
    case when p_accept then 'accept' when not p_accept then 'reject' else null end,
    p_expected_revision,p_command);
$$;
revoke all on function public.request_team_finish(uuid,uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.decide_team_finish(uuid,uuid,boolean,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_team_finish(uuid,uuid,bigint,uuid) to authenticated;
grant execute on function public.decide_team_finish(uuid,uuid,boolean,bigint,uuid) to authenticated;

-- Application routing and deployment activation remain unchanged.
commit;
