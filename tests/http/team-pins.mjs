// Real Auth/Postgres, synthetic credentials, disposable GitHub runner only.
// Next request plumbing is replaced; creation/login functions are repository code.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash, randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadSource } from '../inventory/source-fixture.mjs'
assert.equal(process.env.GITHUB_ACTIONS, 'true')
const status = JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8'}))
assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=r=>{if(r.error)throw new Error(r.error.message);return r.data}
const helper=await loadSource('lib/pin-credentials.ts',{'node:crypto':{createHash,randomInt}})
const pagination=await loadSource('lib/fetch-all-rows.ts')
const main=checked(await db.from('warehouses').select('id').eq('name','Main').single())
const session=checked(await db.from('count_sessions').insert({warehouse_id:main.id}).select('id').single())
const roles=['contador_1','contador_2','independente']
const input=[{team_name:'Synthetic PIN team',equipeNum:1,pessoas:roles.map((role,i)=>({nome:'Synthetic '+i,role}))}]
const dependencies={
 '@/lib/pin-credentials':helper,
 '@/lib/supabase-server':{createClient:async()=>db},
 '@/lib/supabase-admin':{createAdminClient:()=>db},
 '@/lib/fetch-all-rows':pagination,
 '@/lib/authorization':{isAdmin:async()=>true,getTeamCounterAccess:async()=>null},
 '@/actions/settings':{getDefaultTare:async()=>({box_tare_g:300,tolerance_g:0})},
 'next/navigation':{redirect:()=>{throw new Error('REDIRECT')}}
}
const action=await loadSource('actions/sessao.ts',dependencies)
const old=await db.auth.admin.createUser({email:randomUUID()+'@example.invalid',password:'1234',email_confirm:true})
assert.ok(old.error,'Original four-character Auth password must reproduce failure')
console.log('PASS: original four-character createUser password rejected by real Auth')
const result=await action.criarEquipes(session.id,input)
assert.equal(result.error,undefined)
assert.equal(result.credenciais.length,3)
assert.equal(new Set(result.credenciais.map(c=>c.user_pin)).size,3)
let currentClient
const login=await loadSource('actions/auth.ts',{
 '@/lib/pin-credentials':helper,
 '@supabase/ssr':{createServerClient:()=>currentClient},
 'next/headers':{cookies:async()=>({getAll:()=>[],set:()=>{}})},
 'next/navigation':{redirect:()=>{throw new Error('REDIRECT')}}
},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY}}})
async function signIn(team,user){
 currentClient=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 try{const r=await login.login(null,new Map([['team_pin',team],['user_pin',user]]));return r}
 catch(e){if(e.message!=='REDIRECT')throw e;return {ok:true}}
}
checked(await db.from('inventory_items').insert({brand_code:'PIN-SYNTHETIC',brand_name:'Synthetic',category:'Test',category1:'Test',bpu:12,pallet_size:0,warehouse_id:main.id}))
for(const c of result.credenciais){
 assert.match(c.team_pin,/^\d{4}$/);assert.match(c.user_pin,/^\d{4}$/)
 assert.equal((await signIn(c.team_pin,c.user_pin)).ok,true)
 const account=checked(await currentClient.from('counter_accounts').select('team_id,role').eq('role',c.role).single())
 assert.equal(account.role,c.role)
 checked(await currentClient.from('count_entries').insert({team_id:account.team_id,counter_role:c.role,brand_code:'PIN-SYNTHETIC',cases:2,final_cases:2}))
 const own=checked(await currentClient.from('count_entries').select('counter_role').eq('team_id',account.team_id))
 assert.ok(own.every(e=>e.counter_role===c.role),'Blind count must not expose other roles')
 const foreign=await currentClient.from('count_entries').insert({team_id:account.team_id,counter_role:roles.find(r=>r!==c.role),brand_code:'PIN-SYNTHETIC',cases:99,final_cases:99})
 assert.ok(foreign.error,'Counter cannot impersonate another role')
}
console.log('PASS: all three four-digit logins create real counts with blind access and role protection')
assert.ok((await signIn(result.credenciais[0].team_pin,'0000')).error)
console.log('PASS: incorrect PIN denied')
// Synthetic old account: Auth now refuses creating weak passwords, so emulate
// a historical bcrypt hash ONLY inside disposable Postgres, never production.
const legacyPin='0482',legacyTeam='0000'
const legacy=checked(await db.auth.admin.createUser({email:legacyTeam+legacyPin+'@count.local',password:randomUUID()+'aA1!',email_confirm:true})).user
execFileSync('psql',['-v','ON_ERROR_STOP=1','-c',`update auth.users set encrypted_password=extensions.crypt('${legacyPin}',extensions.gen_salt('bf')) where id='${legacy.id}'::uuid`],
 {env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGUSER:'postgres',PGPASSWORD:'postgres',PGDATABASE:'postgres'},stdio:'pipe'})
assert.equal((await signIn(legacyTeam,legacyPin)).ok,true)
console.log('PASS: legacy four-digit password login still works (leading zero preserved)')
// Fail the second account; first account + its access + new team must disappear.
const secondSession=checked(await db.from('count_sessions').insert({warehouse_id:main.id}).select('id').single())
const beforeUsers=checked(await db.auth.admin.listUsers({perPage:1000})).users.length
let calls=0
const failingAdmin={from:db.from.bind(db),auth:{admin:{
 createUser:async p=>++calls===2?{data:{user:null},error:{message:'Synthetic failure'}}:db.auth.admin.createUser(p),
 deleteUser:db.auth.admin.deleteUser.bind(db.auth.admin)
}}}
const failing=await loadSource('actions/sessao.ts',{...dependencies,'@/lib/supabase-admin':{createAdminClient:()=>failingAdmin}})
assert.ok((await failing.criarEquipes(secondSession.id,input)).error)
assert.equal(checked(await db.from('teams').select('id').eq('session_id',secondSession.id)).length,0)
assert.equal(checked(await db.auth.admin.listUsers({perPage:1000})).users.length,beforeUsers)
assert.equal(checked(await db.from('teams').select('id').eq('session_id',session.id)).length,1)
console.log('PASS: partial Auth failure removes only newly created team/accounts; existing team retained')
const denied=await loadSource('actions/sessao.ts',{...dependencies,'@/lib/authorization':{isAdmin:async()=>false,getTeamCounterAccess:async()=>null}})
assert.ok((await denied.criarEquipes(session.id,input)).error)
console.log('PASS: non-admin creation rejected')
console.log('NOTE: production untouched; this exercises real action code + Auth/Postgres, not browser clicks')
