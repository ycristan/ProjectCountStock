-- Decision of 2026-10-29 (R11/R12 revised): counters sign first, the Independent
-- last; the last confirmation no longer closes the team. The admin confirms the
-- close, and only then every access of the team is revoked.
-- No drop: the Supabase connector hangs on any drop statement.
begin;

alter table public.team_flows add column closed_by uuid references auth.users(id) on delete restrict;
create index team_flows_closed_by_idx on public.team_flows(closed_by);

-- The Independent confirms (PIN or formal absence) only after every counter.
create function private.guard_team_confirmation_order()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if exists(select 1 from public.team_memberships where team_id=new.team_id and id=new.membership_id and role='independent')
    and exists(select 1 from public.team_memberships m where m.team_id=new.team_id and m.role='counter'
      and m.id not in (select membership_id from private.team_confirmed(new.team_id,new.version_id))) then
    raise exception 'Counters sign first';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_team_confirmation_order() from public,anon,authenticated,service_role;
create trigger guard_team_confirmation_order before insert on public.team_confirmations
for each row execute function private.guard_team_confirmation_order();

-- The first confirmation still freezes the team (R11). With every confirmation
-- in, the team waits for the admin: 'signed' is a receipt state, not a phase.
create or replace function private.after_team_confirmation(p_team uuid)
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
  return 'signed';
end;
$$;

-- R12: the admin closes the team once every confirmation is in; closing and
-- revoking every access happen in the same transaction.
create function private.confirm_team_close(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare sc record; f public.team_flows; payload jsonb; receipt jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode='42501',message='Close not authorized';
  end if;
  payload:=jsonb_build_array('close',p_version);
  select * into sc from private.signing_command(p_team,p_version,p_command,payload);
  f:=sc.f; receipt:=sc.receipt;
  if receipt is not null then return receipt; end if;
  if exists(select 1 from public.team_memberships m where m.team_id=p_team
      and m.id not in (select membership_id from private.team_confirmed(p_team,f.result_version_id))) then
    raise exception 'Every confirmation is needed before closing';
  end if;
  update public.team_memberships set access_revoked_at=clock_timestamp()
    where team_id=p_team and access_revoked_at is null;
  update public.team_flows set phase='closed',closed_at=clock_timestamp(),closed_by=auth.uid(),revision=revision+1
    where team_id=p_team;
  receipt:=jsonb_build_object('phase','closed');
  insert into private.team_count_commands values(p_team,p_command,auth.uid(),payload,receipt);
  return receipt;
end;
$$;
revoke all on function private.confirm_team_close(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.confirm_team_close(p_team uuid,p_version uuid,p_command uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.confirm_team_close(p_team,p_version,p_command); $$;
revoke all on function public.confirm_team_close(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.confirm_team_close(uuid,uuid,uuid),private.confirm_team_close(uuid,uuid,uuid) to authenticated;

commit;
