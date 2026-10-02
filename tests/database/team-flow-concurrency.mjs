// Concurrency probes against disposable CI Postgres only; never accepts a DB URL.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub runner required')
const env = {...process.env, PGHOST:'127.0.0.1',PGPORT:'54322',PGUSER:'postgres',
  PGPASSWORD:'postgres',PGDATABASE:'postgres'}
const args = ['-X','-qAt','-v','ON_ERROR_STOP=1']
function sql(text) { return execFileSync('psql', [...args,'-c',text], {env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim() }
function start(text, name, keepOpen=false) {
  const child=spawn('psql',args,{env:{...env,PGAPPNAME:name},stdio:'pipe'})
  let out='',err=''
  child.stdout.on('data',d=>{out+=d.toString()})
  child.stderr.on('data',d=>{err+=d.toString()})
  const done=new Promise((resolve,reject)=>{
    child.on('error',reject)
    child.on('close',code=>resolve({code,out,err}))
  })
  child.stdin.write(text+'\n')
  if(!keepOpen)child.stdin.end()
  return {child,done,output:()=>out}
}
async function until(check,label) {
  for(let i=0;i<100;i++){if(check())return;await delay(50)}
  throw new Error(label)
}
const ids=Array.from({length:12},()=>randomUUID())
const [session,team,c1,c2,ind,m1,m2,mi,s1,s2,a1,a2]=ids
const record=randomUUID(),code='concurrency-'+randomUUID()
sql(`
insert into auth.users(id,email) values
('${c1}','${c1}@example.invalid'),('${c2}','${c2}@example.invalid'),('${ind}','${ind}@example.invalid');
insert into public.count_sessions(id) values('${session}');
insert into public.teams(id,session_id,team_name) values('${team}','${session}','Concurrency fixture');
insert into public.team_flows(team_id) values('${team}');
insert into public.team_memberships(id,team_id,user_id,display_name,role,display_order) values
('${m1}','${team}','${c1}','Counter 1','counter',1),
('${m2}','${team}','${c2}','Counter 2','counter',2),
('${mi}','${team}','${ind}','Independent','independent',0);
insert into public.team_count_slots(id,team_id,ordinal) values('${s1}','${team}',1),('${s2}','${team}',2);
insert into public.team_slot_assignments(id,team_id,slot_id,membership_id) values
('${a1}','${team}','${s1}','${m1}'),('${a2}','${team}','${s2}','${m2}');
update public.team_flows set phase='counting',revision=1 where team_id='${team}';
insert into public.inventory_items(brand_code,brand_name,bpu,pallet_size) values('${code}','Synthetic concurrency',20,0);
insert into public.team_count_records(id,team_id,assignment_id,slot_id,brand_code,units,method,bpu_at_entry)
values('${record}','${team}','${a1}','${s1}','${code}',10,'manual',20);
`)
const first=start(`update public.team_count_records set units=11,revision=1 where id='${record}';`,'foundation-revision-a')
const second=start(`update public.team_count_records set units=12,revision=1 where id='${record}';`,'foundation-revision-b')
const outcomes=await Promise.all([first.done,second.done])
assert.equal(outcomes.filter(r=>r.code===0).length,1,'Exactly one writer can consume revision zero')
assert.match(outcomes.find(r=>r.code!==0).err,/Count revision must advance by one/)
assert.equal(sql(`select count(*) from public.team_count_record_history where record_id='${record}'`),'1')
console.log('PASS: simultaneous count edits preserve one winner and one original revision')

const freezer=start(`begin; select team_id from public.team_flows where team_id='${team}' for update; select 'FLOW_LOCKED';`,
  'foundation-freezer',true)
let writer
try {
  await until(()=>freezer.output().includes('FLOW_LOCKED'),'Flow lock was not acquired')
  writer=start(`update public.team_count_records set units=99,revision=2 where id='${record}';`,'foundation-blocked-writer')
  await until(()=>sql("select exists(select 1 from pg_stat_activity where application_name='foundation-blocked-writer' and wait_event_type='Lock')")==='t',
    'Concurrent writer did not wait for team lock')
  freezer.child.stdin.end(`
update public.team_memberships set finish_state='requested' where team_id='${team}' and role='counter';
update public.team_memberships set finish_state='accepted' where team_id='${team}' and role='counter';
update public.team_flows set phase='reconciling',revision=2 where team_id='${team}';
update public.team_flows set phase='admin_review',revision=3 where team_id='${team}';
update public.team_flows set result_version_id=private.build_team_result_snapshot(
 '${team}',3,'${mi}',(select jsonb_agg(jsonb_build_object('brand_code',brand_code,
 'quantity_units',quantity_units,'resolution','reconciled','resolved_by','${mi}'))
 from public.team_count_records where team_id='${team}')),
 phase='signing',revision=4 where team_id='${team}';
update public.team_flows set frozen_at=now(),revision=5 where team_id='${team}';
commit;
`)
  assert.equal((await freezer.done).code,0,'Freeze transaction must commit')
  const result=await writer.done
  assert.notEqual(result.code,0)
  assert.match(result.err,/Team results are frozen/)
  assert.notEqual(sql(`select quantity_units from public.team_count_records where id='${record}'`),'99')
  assert.equal(sql(`select count(*) from public.team_count_record_history where record_id='${record}'`),'1')
  console.log('PASS: count write waiting behind freeze is denied after lock release; history stays intact')
} finally {
  freezer.child.kill()
  writer?.child.kill()
}
// This probes SQL lock/constraint invariants, NOT signature evidence or UI completion.
// Fixtures remain in the discarded runner database; no production cleanup/delete.


// Block 3A internal setup transaction: concurrent retry, not Auth/UI provisioning.
function setupSql(text) {
  try { return sql(text) } catch { throw new Error('Synthetic team setup SQL failed (details suppressed)') }
}
const setupAdmin=randomUUID(),setupSession=randomUUID(),setupCommand=randomUUID()
const setupPeople=Array.from({length:5},()=>randomUUID())
const setupPin=setupSql("select p::text from generate_series(1000,9999) p where not exists(select 1 from public.teams where team_pin=p::text) and not exists(select 1 from auth.users where left(email,4)=p::text) order by random() limit 1")
// Do not log generated credentials or SQL text.
assert.match(setupPin,/^[0-9]{4}$/)
setupSql(`
insert into auth.users(id,email) values('${setupAdmin}','${setupAdmin}@example.invalid');
insert into public.app_user_access(user_id,access_kind) values('${setupAdmin}','admin');
insert into public.count_sessions(id) values('${setupSession}');
${setupPeople.map((id,i)=>"insert into auth.users(id,email) values('"+id+"','"+setupPin+String(i).padStart(4,'0')+"@count.local');").join('\n')}
`)
const setupMembers=JSON.stringify(setupPeople.map((user_id,i)=>({
  user_id,name:'Synthetic participant',role:i===4?'independent':'counter'
})))
const setupCall=`select private.build_team_setup('${setupSession}','${setupCommand}','Concurrent setup','${setupPin}','${setupMembers}'::jsonb);`
const setActor=`select set_config('request.jwt.claim.sub','${setupAdmin}',false);`
const setupFirst=start('begin;'+setActor+setupCall+"select 'SETUP_LOCKED';",'setup-first',true)
let setupRetry
try {
  await until(()=>setupFirst.output().includes('SETUP_LOCKED'),'Setup lock was not acquired')
  setupRetry=start(setActor+setupCall,'setup-retry')
  await until(()=>setupSql("select exists(select 1 from pg_stat_activity where application_name='setup-retry' and wait_event_type='Lock')")==='t','Setup retry did not wait')
  setupFirst.child.stdin.end('commit;\n')
  const a=await setupFirst.done
  const b=await setupRetry.done
  assert.equal(a.code,0,'First setup must commit')
  assert.equal(b.code,0,'Retry must return committed receipt')
  const savedTeam=setupSql(`select team_id from private.team_setup_receipts where command_id='${setupCommand}'`)
  assert.ok(a.out.includes(savedTeam)&&b.out.includes(savedTeam),'Both requests return the same team')
  assert.equal(setupSql(`select count(*) from public.teams where session_id='${setupSession}'`),'1')
  assert.equal(setupSql(`select count(*) from public.team_memberships where team_id='${savedTeam}'`),'5')
  assert.equal(setupSql(`select count(*) from public.team_count_slots where team_id='${savedTeam}'`),'4')
  console.log('PASS: concurrent internal setup retry creates exactly one five-person team and four counter positions')
} finally {
  setupFirst.child.kill()
  setupRetry?.child.kill()
}
