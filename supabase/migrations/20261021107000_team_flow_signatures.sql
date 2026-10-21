-- Block 11: absent counter (R08), signatures and formal absences (R11),
-- freeze on the first confirmation and team closing with revocation (R12).
-- Substitution (R09) and shared Independent (R10) stay deferred.
begin;

-- R08: the Independent records a counter who left and will not return.
create table public.team_departures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  membership_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  recorded_by uuid not null,
  flow_revision bigint not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(team_id,membership_id),
  foreign key(team_id,membership_id) references public.team_memberships(team_id,id) on delete restrict,
  foreign key(team_id,recorded_by) references public.team_memberships(team_id,id) on delete restrict
);
create index team_departures_actor_idx on public.team_departures(team_id,recorded_by);

-- R11: one confirmation per participant for the selected result version.
-- PIN signature by the person, or formal absence (counter: by the Independent;
-- Independent: by an admin, valid only after an identified witness confirms).
create table public.team_confirmations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_flows(team_id) on delete restrict,
  version_id uuid not null,
  membership_id uuid not null,
  kind text not null check (kind in ('pin','absence')),
  reason text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  witness_user_id uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  witnessed_at timestamptz,
  unique(team_id,version_id,membership_id),
  foreign key(team_id,version_id) references public.team_result_versions(team_id,id) on delete restrict,
  foreign key(team_id,membership_id) references public.team_memberships(team_id,id) on delete restrict,
  check ((kind='pin') = (reason is null)),
  check (reason is null or btrim(reason) <> ''),
  check (kind='absence' or witness_user_id is null),
  check ((witness_user_id is null) = (witnessed_at is null))
);
create index team_confirmations_member_idx on public.team_confirmations(team_id,membership_id);
create index team_confirmations_recorder_idx on public.team_confirmations(recorded_by);
create index team_confirmations_witness_idx on public.team_confirmations(witness_user_id);

alter table public.team_departures enable row level security;
alter table public.team_confirmations enable row level security;
revoke all on public.team_departures,public.team_confirmations from public,anon,authenticated,service_role;
grant select on public.team_departures,public.team_confirmations to authenticated,service_role;
create policy team_departure_read on public.team_departures for select to authenticated
  using (private.team_flow_visible(team_id,true));
create policy team_confirmation_read on public.team_confirmations for select to authenticated
  using (private.team_flow_visible(team_id,false));

create function private.guard_team_departure()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Departures are append-only'; end; $$;
revoke all on function private.guard_team_departure() from public,anon,authenticated,service_role;
create trigger guard_team_departure before update or delete on public.team_departures
for each row execute function private.guard_team_departure();

-- Only the witness of a pending absence can be added, once.
create function private.guard_team_confirmation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op='DELETE' or old.witness_user_id is not null or new.witness_user_id is null
    or (to_jsonb(new)-'witness_user_id'-'witnessed_at') is distinct from (to_jsonb(old)-'witness_user_id'-'witnessed_at') then
    raise exception 'Confirmations are append-only';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_team_confirmation() from public,anon,authenticated,service_role;
create trigger guard_team_confirmation before update or delete on public.team_confirmations
for each row execute function private.guard_team_confirmation();

-- Cancelling a collection is an admin decision kept with accept/return.
alter table public.team_admin_reviews drop constraint team_admin_reviews_decision_check;
alter table public.team_admin_reviews add constraint team_admin_reviews_decision_check
  check (decision in ('accept','return','cancel_signing'));

-- R04 with R08: an absent counter's counts stay in the comparison; products he
-- did not count no longer require him.
create or replace function private.team_comparison(p_team uuid)
returns table(brand_code text, status text, tolerance_limit bigint, cells jsonb)
language sql stable security invoker set search_path = ''
as $$
  with slot as (
    select s.id slot_id, s.ordinal, a.membership_id active_member
    from public.team_count_slots s
    left join public.team_slot_assignments a on a.team_id=s.team_id and a.slot_id=s.id and a.ended_at is null
    left join public.team_memberships m on m.team_id=a.team_id and m.id=a.membership_id and m.role='counter'
    where s.team_id=p_team
  ), cell as (
    select b.brand_code, q.ordinal, coalesce(ra.membership_id,q.active_member) membership_id,
      r.id record_id, r.quantity_units, r.method
    from (select distinct c.brand_code from public.team_count_records c where c.team_id=p_team) b
    cross join slot q
    left join public.team_count_records r
      on r.team_id=p_team and r.slot_id=q.slot_id and r.brand_code=b.brand_code
    left join public.team_slot_assignments ra on ra.team_id=r.team_id and ra.id=r.assignment_id
    where q.active_member is not null or r.id is not null
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

-- R08 command. Leaving ends the position and revokes access; when every
-- remaining counter is already accepted the team moves to reconciliation.
create function private.mark_team_counter_absent(p_team uuid,p_membership uuid,p_reason text,
  p_expected_revision bigint,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare f public.team_flows; actor public.team_memberships; subject public.team_memberships;
  command private.team_count_commands; payload jsonb; next_phase text;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Absence not authorized';
  end if;
  if p_membership is null or p_command is null or p_expected_revision is null
    or p_reason is null or btrim(p_reason)='' then
    raise exception using errcode='22023',message='Absence needs a reason';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into actor from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and role='independent' and departed_at is null and access_revoked_at is null;
  if actor.id is null or f.team_id is null then
    raise exception using errcode='42501',message='Absence not authorized';
  end if;
  payload:=jsonb_build_array('absent',p_membership,btrim(p_reason),p_expected_revision);
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    return command.receipt;
  end if;
  if f.phase<>'counting' or f.frozen_at is not null then
    raise exception 'Absence is recorded during counting; at signature use the formal absence';
  end if;
  if f.revision<>p_expected_revision then
    raise exception using errcode='40001',message='Team changed; refresh before recording absence';
  end if;
  select * into subject from public.team_memberships where team_id=p_team and id=p_membership
    and role='counter' and departed_at is null and access_revoked_at is null;
  if subject.id is null then raise exception using errcode='22023',message='Not an active counter of this team'; end if;
  update public.team_slot_assignments set ended_at=clock_timestamp()
    where team_id=p_team and membership_id=subject.id and ended_at is null;
  update public.team_memberships set departed_at=clock_timestamp(),access_revoked_at=clock_timestamp()
    where id=subject.id;
  insert into public.team_departures(team_id,membership_id,reason,recorded_by,flow_revision)
    values(p_team,subject.id,btrim(p_reason),actor.id,f.revision);
  next_phase:='counting';
  if not exists(select 1 from public.team_slot_assignments a
      join public.team_memberships m on m.team_id=a.team_id and m.id=a.membership_id
      where a.team_id=p_team and a.ended_at is null and m.finish_state<>'accepted') then
    next_phase:='reconciling';
  end if;
  update public.team_flows set phase=next_phase,revision=revision+1 where team_id=p_team;
  command.receipt:=jsonb_build_object('revision',(f.revision+1)::text,'phase',next_phase);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,command.receipt);
  return command.receipt;
end;
$$;
revoke all on function private.mark_team_counter_absent(uuid,uuid,text,bigint,uuid) from public,anon,authenticated,service_role;

-- Counted confirmation: PIN, counter absence, or witnessed Independent absence.
create function private.team_confirmed(p_team uuid,p_version uuid)
returns table(membership_id uuid) language sql stable security invoker set search_path = ''
as $$
  select c.membership_id from public.team_confirmations c
  join public.team_memberships m on m.team_id=c.team_id and m.id=c.membership_id
  where c.team_id=p_team and c.version_id=p_version
    and (c.kind='pin' or m.role='counter' or c.witness_user_id is not null);
$$;
revoke all on function private.team_confirmed(uuid,uuid) from public,anon,authenticated,service_role;

-- After a counted confirmation: the first one freezes the team (R11); the last
-- one closes it and revokes every access in the same transaction (R12).
create function private.after_team_confirmation(p_team uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare f public.team_flows;
begin
  select * into strict f from public.team_flows where team_id=p_team for update;
  update public.team_flows set frozen_at=coalesce(frozen_at,clock_timestamp()),revision=revision+1
    where team_id=p_team;
  if exists(select 1 from public.team_memberships m where m.team_id=p_team
      and m.id not in (select membership_id from private.team_confirmed(p_team,f.result_version_id))) then
    return 'signing';
  end if;
  update public.team_memberships set access_revoked_at=clock_timestamp()
    where team_id=p_team and access_revoked_at is null;
  update public.team_flows set phase='closed',closed_at=clock_timestamp(),revision=revision+1 where team_id=p_team;
  return 'closed';
end;
$$;
revoke all on function private.after_team_confirmation(uuid) from public,anon,authenticated,service_role;

-- Shared checks for signing commands: current version, open collection, retry.
create function private.signing_command(p_team uuid,p_version uuid,p_command uuid,p_payload jsonb,
  out f public.team_flows,out receipt jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare command private.team_count_commands;
begin
  if p_command is null or p_version is null then
    raise exception using errcode='22023',message='Invalid confirmation';
  end if;
  select * into f from public.team_flows where team_id=p_team for update;
  select * into command from private.team_count_commands where team_id=p_team and command_id=p_command;
  if command.command_id is not null then
    if command.actor_id<>auth.uid() or command.payload<>p_payload then
      raise exception using errcode='22023',message='Command identifier already used'; end if;
    receipt:=command.receipt; return;
  end if;
  if f.phase<>'signing' then raise exception 'Signature collection is not open'; end if;
  if f.result_version_id<>p_version then
    raise exception using errcode='40001',message='Result version changed; refresh before confirming';
  end if;
end;
$$;
revoke all on function private.signing_command(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- PIN signature: the session is the signer's own (PIN login), never the admin's.
create function private.sign_team_result(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; me public.team_memberships; payload jsonb; receipt jsonb; outcome text;
begin
  if auth.uid() is null or not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Signature not authorized';
  end if;
  payload:=jsonb_build_array('sign',p_version);
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  select * into me from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and departed_at is null and access_revoked_at is null;
  if me.id is null then raise exception using errcode='42501',message='Signature not authorized'; end if;
  if exists(select 1 from public.team_confirmations where team_id=p_team and version_id=p_version and membership_id=me.id) then
    raise exception 'Already confirmed';
  end if;
  insert into public.team_confirmations(team_id,version_id,membership_id,kind,recorded_by)
    values(p_team,p_version,me.id,'pin',auth.uid());
  outcome:=private.after_team_confirmation(p_team);
  receipt:=jsonb_build_object('membershipId',me.id,'phase',outcome);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.sign_team_result(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Counter absent at signature: the Independent formalizes the reason, no witness.
create function private.formalize_counter_absence(p_team uuid,p_version uuid,p_membership uuid,p_reason text,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; me public.team_memberships; subject public.team_memberships;
  payload jsonb; receipt jsonb; outcome text;
begin
  if auth.uid() is null or private.is_admin() or not private.team_flow_visible(p_team,true) then
    raise exception using errcode='42501',message='Absence not authorized';
  end if;
  if p_reason is null or btrim(p_reason)='' then
    raise exception using errcode='22023',message='Absence needs a reason';
  end if;
  payload:=jsonb_build_array('absence',p_version,p_membership,btrim(p_reason));
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  select * into me from public.team_memberships where team_id=p_team and user_id=auth.uid()
    and role='independent' and departed_at is null and access_revoked_at is null;
  select * into subject from public.team_memberships where team_id=p_team and id=p_membership and role='counter';
  if me.id is null then raise exception using errcode='42501',message='Absence not authorized'; end if;
  if subject.id is null then raise exception using errcode='22023',message='Not a counter of this team'; end if;
  if exists(select 1 from public.team_confirmations where team_id=p_team and version_id=p_version and membership_id=subject.id) then
    raise exception 'Already confirmed';
  end if;
  insert into public.team_confirmations(team_id,version_id,membership_id,kind,reason,recorded_by)
    values(p_team,p_version,subject.id,'absence',btrim(p_reason),auth.uid());
  outcome:=private.after_team_confirmation(p_team);
  receipt:=jsonb_build_object('membershipId',subject.id,'phase',outcome);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.formalize_counter_absence(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

-- Independent absent: an admin records the reason. It counts (and freezes) only
-- when a witness confirms: a present counter of the team by PIN, or an admin.
create function private.record_independent_absence(p_team uuid,p_version uuid,p_reason text,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; ind public.team_memberships; payload jsonb; receipt jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Absence not authorized';
  end if;
  if p_reason is null or btrim(p_reason)='' then
    raise exception using errcode='22023',message='Absence needs a reason';
  end if;
  payload:=jsonb_build_array('independent_absence',p_version,btrim(p_reason));
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  select * into ind from public.team_memberships where team_id=p_team and role='independent';
  if exists(select 1 from public.team_confirmations where team_id=p_team and version_id=p_version and membership_id=ind.id) then
    raise exception 'Already confirmed';
  end if;
  insert into public.team_confirmations(team_id,version_id,membership_id,kind,reason,recorded_by)
    values(p_team,p_version,ind.id,'absence',btrim(p_reason),auth.uid());
  receipt:=jsonb_build_object('membershipId',ind.id,'phase','signing','witness','pending');
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.record_independent_absence(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.witness_independent_absence(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; c public.team_confirmations; payload jsonb; receipt jsonb; outcome text;
begin
  if auth.uid() is null or not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Witness not authorized';
  end if;
  payload:=jsonb_build_array('witness',p_version);
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  if not private.is_admin() and not exists(select 1 from public.team_memberships where team_id=p_team
      and user_id=auth.uid() and role='counter' and departed_at is null and access_revoked_at is null) then
    raise exception using errcode='42501',message='Witness must be a present counter or an admin';
  end if;
  select c2.* into c from public.team_confirmations c2 join public.team_memberships m on m.id=c2.membership_id
    where c2.team_id=p_team and c2.version_id=p_version and m.role='independent' and c2.kind='absence'
    and c2.witness_user_id is null;
  if c.id is null then raise exception 'No absence waiting for a witness'; end if;
  update public.team_confirmations set witness_user_id=auth.uid(),witnessed_at=clock_timestamp() where id=c.id;
  outcome:=private.after_team_confirmation(p_team);
  receipt:=jsonb_build_object('membershipId',c.membership_id,'phase',outcome);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.witness_independent_absence(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Before any counted confirmation the admin may cancel the collection; the same
-- resolved result is sealed again at the new revision for a later decision.
create function private.cancel_team_signing(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; ind public.team_memberships; payload jsonb; receipt jsonb; results jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Cancel not authorized';
  end if;
  payload:=jsonb_build_array('cancel_signing',p_version);
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  if f.frozen_at is not null then raise exception 'First confirmation received; collection cannot be cancelled'; end if;
  select * into ind from public.team_memberships where team_id=p_team and role='independent'
    and departed_at is null and access_revoked_at is null;
  insert into public.team_admin_reviews(team_id,version_id,decision,decided_by,flow_revision)
    values(p_team,p_version,'cancel_signing',auth.uid(),f.revision);
  update public.team_flows set phase='admin_review',result_version_id=null,revision=revision+1 where team_id=p_team;
  select jsonb_agg(jsonb_build_object('brand_code',r.brand_code,'quantity_units',r.quantity_units,
      'resolution',r.resolution,'resolved_by',r.resolved_by)) into results from private.team_resolutions(p_team) r;
  perform private.build_team_result_snapshot(p_team,f.revision+1,ind.id,results);
  receipt:=jsonb_build_object('phase','admin_review','revision',(f.revision+1)::text);
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.cancel_team_signing(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Signature screen: Independent first, then counters in order (R11).
create function private.read_team_signing(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare f public.team_flows;
begin
  if not private.team_flow_visible(p_team,false) then
    raise exception using errcode='42501',message='Team access unavailable';
  end if;
  select * into strict f from public.team_flows where team_id=p_team;
  if f.phase<>'signing' then return null; end if;
  return jsonb_build_object('versionId',f.result_version_id,'frozen',f.frozen_at is not null,
    'participants',(select jsonb_agg(jsonb_build_object('membershipId',m.id,'name',m.display_name,'role',m.role,
        'order',m.display_order,'departed',m.departed_at is not null,
        'confirmation',(select jsonb_build_object('kind',c.kind,'reason',c.reason,'recordedAt',c.recorded_at,
            'witnessed',c.witness_user_id is not null)
          from public.team_confirmations c where c.team_id=p_team and c.version_id=f.result_version_id and c.membership_id=m.id))
      order by m.role<>'independent',m.display_order)
      from public.team_memberships m where m.team_id=p_team));
end;
$$;
revoke all on function private.read_team_signing(uuid) from public,anon,authenticated,service_role;


-- Foundation guard: also allows the closing revocation of a frozen team.
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
  -- Closing revokes every membership while the frozen team is still in signing.
  if f.frozen_at is not null or f.phase='closed' then
    if not (tg_table_name='team_memberships' and tg_op='UPDATE' and f.phase='signing'
      and to_jsonb(old)->>'access_revoked_at' is null and to_jsonb(new)->>'access_revoked_at' is not null
      and (to_jsonb(new)-'access_revoked_at')=(to_jsonb(old)-'access_revoked_at')) then
      raise exception 'Team results are frozen';
    end if;
    return new;
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

-- Foundation finish command without the fail-closed departure check (R08 is now handled).
create or replace function private.team_finish_command(
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
    -- R08: absent counters no longer take part; the subject must hold an active position.
    if not exists(select 1 from public.team_slot_assignments
        where team_id=p_team and membership_id=subject.id and ended_at is null) then
      raise exception 'Participant has no active counting position';
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

-- Members carry the R08 absence so the monitor shows who left.
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

create function public.mark_team_counter_absent(p_team uuid,p_membership uuid,p_reason text,p_expected_revision bigint,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.mark_team_counter_absent(p_team,p_membership,p_reason,p_expected_revision,p_command); $$;
create function public.sign_team_result(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.sign_team_result(p_team,p_version,p_command); $$;
create function public.formalize_counter_absence(p_team uuid,p_version uuid,p_membership uuid,p_reason text,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.formalize_counter_absence(p_team,p_version,p_membership,p_reason,p_command); $$;
create function public.record_independent_absence(p_team uuid,p_version uuid,p_reason text,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.record_independent_absence(p_team,p_version,p_reason,p_command); $$;
create function public.witness_independent_absence(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.witness_independent_absence(p_team,p_version,p_command); $$;
create function public.cancel_team_signing(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cancel_team_signing(p_team,p_version,p_command); $$;
create function public.read_team_signing(p_team uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_team_signing(p_team); $$;
revoke all on function public.mark_team_counter_absent(uuid,uuid,text,bigint,uuid),public.sign_team_result(uuid,uuid,uuid),
  public.formalize_counter_absence(uuid,uuid,uuid,text,uuid),public.record_independent_absence(uuid,uuid,text,uuid),
  public.witness_independent_absence(uuid,uuid,uuid),public.cancel_team_signing(uuid,uuid,uuid),public.read_team_signing(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_team_counter_absent(uuid,uuid,text,bigint,uuid),private.mark_team_counter_absent(uuid,uuid,text,bigint,uuid),
  public.sign_team_result(uuid,uuid,uuid),private.sign_team_result(uuid,uuid,uuid),
  public.formalize_counter_absence(uuid,uuid,uuid,text,uuid),private.formalize_counter_absence(uuid,uuid,uuid,text,uuid),
  public.record_independent_absence(uuid,uuid,text,uuid),private.record_independent_absence(uuid,uuid,text,uuid),
  public.witness_independent_absence(uuid,uuid,uuid),private.witness_independent_absence(uuid,uuid,uuid),
  public.cancel_team_signing(uuid,uuid,uuid),private.cancel_team_signing(uuid,uuid,uuid),
  public.read_team_signing(uuid),private.read_team_signing(uuid) to authenticated;
alter publication supabase_realtime add table public.team_confirmations,public.team_departures;

commit;
