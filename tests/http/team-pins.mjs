// Real Auth/Postgres, synthetic credentials, disposable GitHub runner only.
// Next request plumbing is replaced; creation/login functions are repository code.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID, createHash, randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { setTimeout as delay } from 'node:timers/promises'
import { loadSource } from '../inventory/source-fixture.mjs'
assert.equal(process.env.GITHUB_ACTIONS, 'true')
await import('./auth-policy-environment.mjs')
const status = JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8'}))
assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=r=>{if(r.error)throw new Error(r.error.message);return r.data}
const helper=await loadSource('lib/pin-credentials.ts',{'node:crypto':{createHash,randomInt}})
const pagination=await loadSource('lib/fetch-all-rows.ts')
const adminPassword=randomUUID()+'aA1!'
const adminEmail=randomUUID()+'@example.invalid'
const administrator=checked(await db.auth.admin.createUser({email:adminEmail,password:adminPassword,email_confirm:true})).user
checked(await db.from('app_user_access').insert({user_id:administrator.id,access_kind:'admin'}))
const adminSession=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
checked(await adminSession.auth.signInWithPassword({email:adminEmail,password:adminPassword}))
const main=checked(await db.from('warehouses').select('id').eq('name','Main').single())
const session=checked(await db.from('count_sessions').insert({warehouse_id:main.id}).select('id').single())
const roles=['contador_1','contador_2','independente']
const input=[{team_name:'Synthetic PIN team',equipeNum:1,pessoas:roles.map((role,i)=>({nome:'Synthetic '+i,role}))}]
const dependencies={
 '@/lib/pin-credentials':helper,
 '@/lib/supabase-server':{createClient:async()=>adminSession},
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
const authorization=await loadSource('lib/authorization.ts',{
 '@/lib/supabase-server':{createClient:async()=>currentClient},
 '@/lib/supabase-admin':{createAdminClient:()=>db}
})
const countActions=await loadSource('actions/contagem.ts',{
 '@/lib/supabase-server':{createClient:async()=>currentClient},
 '@/lib/authorization':authorization,'@/lib/fetch-all-rows':pagination
})
const finalActions=await loadSource('actions/finalizacao.ts',{
 '@/lib/supabase-admin':{createAdminClient:()=>db},'@/lib/authorization':authorization
})
for(const c of result.credenciais){
 assert.match(c.team_pin,/^\d{4}$/);assert.match(c.user_pin,/^\d{4}$/)
 assert.equal((await signIn(c.team_pin,c.user_pin)).ok,true)
 const account=checked(await currentClient.from('counter_accounts').select('team_id,role').eq('role',c.role).single())
 assert.equal(account.role,c.role)
 const payload={brand_code:'PIN-SYNTHETIC',pallets:0,cases:2,units:0}
 if(c.role==='independente'){
   assert.ok((await countActions.lancarContagem(payload)).error)
   assert.ok((await finalActions.finalizarContagem()).error)
   const denied=await currentClient.from('count_entries').insert({team_id:account.team_id,counter_role:c.role,brand_code:'PIN-SYNTHETIC',cases:2,final_cases:2})
   assert.ok(denied.error,'Independent cannot insert initial counts through the API')
   const monitored=checked(await currentClient.from('count_entries').select('counter_role').eq('team_id',account.team_id))
   assert.deepEqual(new Set(monitored.map(e=>e.counter_role)),new Set(['contador_1','contador_2']))
   const before=checked(await db.from('count_entries').select('id,final_cases').eq('team_id',account.team_id))
   checked(await currentClient.from('count_entries').update({final_cases:99}).eq('team_id',account.team_id))
   checked(await currentClient.from('count_entries').delete().eq('team_id',account.team_id))
   assert.deepEqual(checked(await db.from('count_entries').select('id,final_cases').eq('team_id',account.team_id)),before)
 }else{
   assert.equal((await countActions.lancarContagem(payload)).final_cases,2)
   assert.equal((await finalActions.finalizarContagem()).success,true)
 }
 const own=checked(await currentClient.from('count_entries').select('counter_role').eq('team_id',account.team_id).eq('counter_role',c.role))
 assert.ok(own.every(e=>e.counter_role===c.role),'Role-scoped query returns the current counter entries')
 const foreign=await currentClient.from('count_entries').insert({team_id:account.team_id,counter_role:roles.find(r=>r!==c.role),brand_code:'PIN-SYNTHETIC',cases:99,final_cases:99})
 assert.ok(foreign.error,'Counter cannot impersonate another role')
}
// Exercise the actual built Next routes with real Auth cookies, not mocked pages.
// inventory-export.mjs built this same checkout against this disposable database.
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3101'],{
 env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,VERCEL_ENV:'preview',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'
})
try{
 const base='http://127.0.0.1:3101'
 let ready=false
 for(let i=0;i<60;i++){try{if((await fetch(base+'/login')).ok){ready=true;break}}catch{} await delay(1000)}
 assert.ok(ready,'Built Next application starts')
 for(const c of result.credenciais){
   const jar=new Map()
   const client=createServerClient(status.API_URL,status.ANON_KEY,{cookies:{
     getAll:()=>[...jar].map(([name,value])=>({name,value})),
     setAll:values=>values.forEach(v=>jar.set(v.name,v.value))
   }})
   checked(await client.auth.signInWithPassword({email:c.team_pin+c.user_pin+'@count.local',password:helper.pinPassword(c.team_pin,c.user_pin)}))
   const headers={cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}
   const independent=c.role==='independente'
   const home=await fetch(base+'/',{headers,redirect:'manual'})
   assert.equal(home.status,307)
   assert.ok(home.headers.get('location').endsWith(independent?'/monitor':'/busca'))
   const page=await fetch(base+(independent?'/monitor':'/busca'),{headers,redirect:'manual'})
   assert.equal(page.status,200)
   const html=await page.text()
   assert.equal(html.includes('href="/finalizar"'),!independent)
   if(independent){
     assert.match(html,/Live Count Monitor/)
     for(const path of ['/busca','/finalizar']){
       const blocked=await fetch(base+path,{headers,redirect:'manual'})
       assert.equal(blocked.status,307)
       assert.ok(blocked.headers.get('location').endsWith('/monitor'))
     }
     assert.equal((await fetch(base+'/reconciliacao',{headers,redirect:'manual'})).status,200)
     const user=checked(await client.auth.getUser()).user
     checked(await db.auth.admin.updateUserById(user.id,{user_metadata:{counter_role:'contador_1'}}))
     const spoofed=await fetch(base+'/busca',{headers,redirect:'manual'})
     assert.ok(spoofed.headers.get('location').endsWith('/monitor'),'Editable metadata cannot change protected role')
   }
 }
 console.log('PASS: real HTTP routes send independent to monitor, hide Finalise, preserve reconciliation, ignore metadata spoofing')
}finally{app.kill('SIGTERM')}
const createdTeam=checked(await db.from('teams').select('id').eq('session_id',session.id).single())
checked(await db.rpc('finalize_team_count',{p_team_id:createdTeam.id}))
const reconciliation=checked(await db.from('reconciliation_items').select('status,contador_1_cases,contador_2_cases').eq('team_id',createdTeam.id).single())
assert.equal(reconciliation.status,'combinado')
assert.equal(reconciliation.contador_1_cases,2);assert.equal(reconciliation.contador_2_cases,2)
// Preserve the existing independent reconciliation responsibility.
const reconActions=await loadSource('actions/reconciliacao.ts',{
 '@/lib/supabase-admin':{createAdminClient:()=>db},'@/lib/authorization':authorization
})
const reconRow=checked(await db.from('reconciliation_items').select('id').eq('team_id',createdTeam.id).single())
checked(await db.from('reconciliation_items').update({status:'discrepancia'}).eq('id',reconRow.id))
const independent=result.credenciais.find(c=>c.role==='independente')
assert.equal((await signIn(independent.team_pin,independent.user_pin)).ok,true)
assert.equal((await reconActions.listarDiscrepancias()).length,1)
assert.equal((await reconActions.resolverItemReconciliacao(reconRow.id,2,0)).error,undefined)
assert.equal((await reconActions.confirmarReconciliacao()).error,undefined)
assert.equal((await signIn(result.credenciais[0].team_pin,result.credenciais[0].user_pin)).ok,true)
assert.ok((await reconActions.resolverItemReconciliacao(reconRow.id,99,0)).error)
console.log('PASS: independent still resolves and confirms reconciliation; regular counters cannot')
checked(await db.rpc('combine_session_results',{p_session_id:session.id}))
const total=checked(await db.from('combined_results').select('total_cases,total_units').eq('session_id',session.id).eq('brand_code','PIN-SYNTHETIC').single())
assert.equal(total.total_cases,2);assert.equal(total.total_units,0)
assert.equal(checked(await db.from('count_sessions').select('status').eq('id',session.id).single()).status,'fechada')
console.log('PASS: new team counts reconcile and produce expected final result')
console.log('PASS: C1/C2 count and finalise; independent monitors both and cannot insert, update, delete or finalise initial counts')
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
