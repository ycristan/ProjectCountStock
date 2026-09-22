// Real Auth + PostgREST boundary. Never accepts a remote database or production key.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub runner required')
const status=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
const options={auth:{persistSession:false,autoRefreshToken:false}}
const privileged=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options)
const anonymous=createClient(status.API_URL,status.ANON_KEY,options)
const sqlEnv={...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGUSER:'postgres',PGPASSWORD:'postgres',PGDATABASE:'postgres'}
const sql=s=>execFileSync('psql',['-v','ON_ERROR_STOP=1','-c',s],{env:sqlEnv,stdio:'pipe'})
const checked=r=>{assert.equal(r.error,null,r.error?.message);return r.data}
const people=[]
for(let i=0;i<5;i++){
  const email='finish-'+randomUUID()+'@example.invalid',password=randomUUID()+'aA!9'
  const user=checked(await privileged.auth.admin.createUser({email,password,email_confirm:true,
    user_metadata:i===4?{role:'independent',is_admin:true}:{}})).user
  const client=createClient(status.API_URL,status.ANON_KEY,options)
  checked(await client.auth.signInWithPassword({email,password}))
  people.push({id:user.id,client,member:randomUUID()})
}
const session=randomUUID(),team=randomUUID(),other=randomUUID()
sql(`insert into public.app_user_access(user_id,access_kind) values('${people[3].id}','admin');
insert into public.count_sessions(id) values('${session}');
insert into public.teams(id,session_id,team_name) values('${team}','${session}','HTTP finish'),('${other}','${session}','Other');
insert into public.team_flows(team_id) values('${team}'),('${other}');
${people.slice(0,3).map((p,i)=>`insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order)
values('${p.member}','${team}','${p.id}','Synthetic ${i}','${i===2?'independent':'counter'}',${i});`).join('\n')}
${people.slice(0,2).map((p,i)=>{const slot=randomUUID();return `insert into public.team_count_slots(id,team_id,ordinal) values('${slot}','${team}',${i+1});
insert into public.team_slot_assignments(team_id,slot_id,membership_id) values('${team}','${slot}','${p.member}');`}).join('\n')}
update public.team_flows set phase='counting',revision=1 where team_id='${team}';`)
const args=(i,revision,command=randomUUID())=>({p_team:team,p_membership:people[i].member,p_expected_revision:revision,p_command:command})
const denied=r=>assert.ok(r.error,'Unauthorized RPC must fail')
denied(await anonymous.rpc('request_team_finish',args(0,1)))
denied(await privileged.rpc('request_team_finish',args(0,1)))
denied(await people[4].client.rpc('request_team_finish',args(0,1)))
denied(await people[0].client.rpc('request_team_finish',args(1,1)))
denied(await people[0].client.rpc('request_team_finish',{...args(0,1),p_team:other}))
denied(await people[3].client.rpc('decide_team_finish',{...args(0,1),p_accept:true}))
console.log('PASS: HTTP denies anonymous, service, forged metadata, wrong actor/team and normal admin decision')
const requests=[args(0,1),args(1,1)]
const raced=await Promise.all(people.slice(0,2).map((p,i)=>p.client.rpc('request_team_finish',requests[i])))
assert.equal(raced.filter(r=>!r.error).length,1)
assert.equal(raced.filter(r=>r.error?.code==='40001').length,1)
const winner=raced.findIndex(r=>!r.error),loser=1-winner
assert.deepEqual(checked(await people[winner].client.rpc('request_team_finish',requests[winner])),raced[winner].data)
checked(await people[loser].client.rpc('request_team_finish',args(loser,2)))
const monitor=people[2].client
const decision=args(winner,3)
checked(await monitor.rpc('decide_team_finish',{...decision,p_accept:false}))
checked(await people[winner].client.rpc('request_team_finish',args(winner,4)))
checked(await monitor.rpc('decide_team_finish',{...args(winner,5),p_accept:true}))
const last={...args(loser,6),p_accept:true}
const receipt=checked(await monitor.rpc('decide_team_finish',last))
assert.equal(receipt.phase,'reconciling')
assert.deepEqual(checked(await monitor.rpc('decide_team_finish',last)),receipt)
const events=checked(await monitor.from('team_finish_events').select('id,actor_membership_id,action').eq('team_id',team))
assert.equal(events.length,6)
const ownEvents=checked(await people[loser].client.from('team_finish_events').select('id').eq('team_id',team))
assert.equal(ownEvents.length,2)
console.log('PASS: real concurrent HTTP commands serialize; retries are idempotent; individual rejection/acceptance is audited')
sql(`update public.team_memberships set access_revoked_at=now() where id='${people[2].member}';`)
denied(await monitor.rpc('decide_team_finish',last))
assert.deepEqual(checked(await monitor.from('team_finish_events').select('id').eq('team_id',team)),[])
console.log('PASS: previously issued Auth session loses RPC and event access after membership revocation')
// Synthetic rows remain only in this disposable runner; never delete real Auth accounts.
