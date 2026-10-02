// Real built Next route + SSR cookie sessions. Called by the disposable HTTP harness.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createServerClient } from '@supabase/ssr'

export async function verifyTeamContexts({base,db,status,sql,envelopes}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const checked=r=>{assert.equal(r.error,null,r.error?.message);return r.data}
  const people=[]
  for(let i=0;i<4;i++){
    const email='context-'+randomUUID()+'@example.invalid',password=randomUUID()+'aA!9'
    const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true,
      user_metadata:{role:'independent',team_id:randomUUID()}})).user
    const jar=new Map()
    const client=createServerClient(status.API_URL,status.ANON_KEY,{
      cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),
        setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}
    })
    checked(await client.auth.signInWithPassword({email,password}))
    people.push({id:user.id,member:randomUUID(),client,email,password,
      cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')})
  }
  const whA=randomUUID(),whB=randomUUID(),sessionA=randomUUID(),sessionB=randomUUID()
  const teamA=randomUUID(),teamB=randomUUID(),memberB=randomUUID()
  sql(`insert into public.warehouses(id,name) values('${whA}','Context A'),('${whB}','Context B');
insert into public.count_sessions(id,warehouse_id) values('${sessionA}','${whA}'),('${sessionB}','${whB}');
insert into public.teams(id,session_id,team_name) values('${teamA}','${sessionA}','Team A'),('${teamB}','${sessionB}','Team B');
insert into public.team_flows(team_id) values('${teamA}'),('${teamB}');
${people.slice(0,3).map((p,i)=>`insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order)
values('${p.member}','${teamA}','${p.id}','Context participant ${i}','${i===2?'independent':'counter'}',${i});`).join('\n')}
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order)
values('${memberB}','${teamB}','${people[2].id}','Shared independent','independent',0);
${people.slice(0,2).map((p,i)=>{const slot=randomUUID();return `insert into public.team_count_slots(id,team_id,ordinal) values('${slot}','${teamA}',${i+1});
insert into public.team_slot_assignments(team_id,slot_id,membership_id) values('${teamA}','${slot}','${p.member}');`}).join('\n')}
update public.team_flows set phase='counting',revision=1 where team_id='${teamA}';`)
  const path='/api/team-flow/context'
  const get=(i,query='')=>fetch(base+path+query,{headers:{cookie:people[i].cookie},redirect:'manual'})
  assert.equal((await fetch(base+path,{redirect:'manual'})).status,307)
  const own=await get(0)
  assert.equal(own.status,200)
  assert.match(own.headers.get('cache-control'),/private, no-store/)
  const ownData=await own.json()
  assert.equal(ownData.teams.length,1)
  assert.equal(ownData.teams[0].role,'counter') // metadata falsely says independent
  assert.equal(ownData.teams[0].membershipId,people[0].member)
  assert.equal(ownData.teams[0].warehouseId,whA)
  assert.equal((await get(0,'?teamId='+teamB)).status,404)
  assert.equal((await get(0,'?teamId=invalid')).status,400)
  assert.equal((await get(0,'?userId='+people[2].id)).status,400)
  assert.equal((await get(0,'?teamId='+teamA+'&teamId='+teamB)).status,400)
  assert.deepEqual((await (await get(3)).json()).teams,[])
  const shared=(await (await get(2)).json()).teams
  assert.equal(shared.length,2)
  assert.deepEqual(new Set(shared.map(t=>t.warehouseId)),new Set([whA,whB]))
  assert.equal((await (await get(2,'?teamId='+teamB)).json()).teams[0].membershipId,memberB)
  console.log('PASS: Next SSR route resolves protected roles and both warehouse contexts; rejects caller-selected identity/team escalation')

  // Close synthetic A via fixture transitions; not evidence of signing UI.
  sql(`update public.team_memberships set finish_state='requested' where team_id='${teamA}' and role='counter';
update public.team_memberships set finish_state='accepted' where team_id='${teamA}' and role='counter';
update public.team_flows set phase='reconciling',revision=2 where team_id='${teamA}';
update public.team_flows set phase='admin_review',revision=3 where team_id='${teamA}';
update public.team_flows set phase='signing',revision=4,
 result_version_id=private.build_team_result_snapshot('${teamA}',3,'${people[2].member}','[]'::jsonb) where team_id='${teamA}';
update public.team_flows set frozen_at=now(),revision=5 where team_id='${teamA}';
update public.team_flows set phase='closed',closed_at=now(),revision=6 where team_id='${teamA}';`)
  assert.equal((await get(2,'?teamId='+teamA)).status,404)
  const remaining=(await (await get(2)).json()).teams
  assert.equal(remaining.length,1)
  assert.equal(remaining[0].teamId,teamB)
  assert.deepEqual((await (await get(0)).json()).teams,[])
  sql(`update public.team_memberships set departed_at=now() where id='${memberB}';`)
  assert.deepEqual((await (await get(2)).json()).teams,[])
  console.log('PASS: same SSR cookies lose closed/departed context immediately; closing A preserves B')

  // Simulated missing migration only in disposable DB. No silent legacy fallback.
  let renamed=false
  try {
    sql("alter function public.my_team_flow_contexts(uuid) rename to my_team_flow_contexts_test_hidden; notify pgrst, 'reload schema'")
    renamed=true
    let response
    for(let i=0;i<15;i++){response=await get(3);if(response.status===503)break;await delay(500)}
    assert.equal(response.status,503)
    const failure=await response.json()
    assert.match(failure.eventId,/^[a-f0-9]{32}$/)
    assert.ok(!('teams' in failure),'Failure must not masquerade as empty membership list')
    let envelope
    for(let i=0;i<20;i++){
      envelope=envelopes.find(e=>e.includes(failure.eventId)&&e.includes('team.context'))
      if(envelope)break
      await delay(250)
    }
    assert.ok(envelope,'Context failure must reach isolated real SDK collector')
    for(const p of people){
      assert.ok(!envelope.includes(p.email))
      assert.ok(!envelope.includes(p.password))
      assert.ok(!envelope.includes(p.cookie))
    }
    assert.ok(!envelope.includes(status.SERVICE_ROLE_KEY))
    console.log('PASS: missing identity RPC returns 503 and sanitized correlated SDK event, not a legacy fallback')
  } finally {
    if(renamed)sql("alter function public.my_team_flow_contexts_test_hidden(uuid) rename to my_team_flow_contexts; notify pgrst, 'reload schema'")
  }
}
