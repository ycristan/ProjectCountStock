// Runs only in a disposable GitHub Actions runner. Never accepts production URLs.
import { verifyRecoveryPreview } from './recovery-preview-browser.mjs'
import { verifyRecoveredWarehouse } from './warehouse-recovery-browser.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import * as XLSX from 'xlsx'
import { verifyTeamPinBrowser } from './team-pin-browser.mjs'
import { verifyTeamContexts } from './team-context.mjs'

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub runner required')
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1')
assert.equal(new URL(status.API_URL).port, '54321')
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}})
const sqlEnv = {...process.env, PGHOST:'127.0.0.1',PGPORT:'54322',PGUSER:'postgres',PGPASSWORD:'postgres',PGDATABASE:'postgres'}
function sql(command) { execFileSync('psql',['-v','ON_ERROR_STOP=1','-c',command],{env:sqlEnv,stdio:'pipe'}) }
function checked(result) { if(result.error) throw new Error(result.error.message);return result.data }
const envelopes=[]
const collector=createServer(async(req,res)=>{
  const chunks=[]
  for await(const chunk of req) chunks.push(chunk)
  const raw=Buffer.concat(chunks)
  envelopes.push((req.headers['content-encoding']==='gzip'?gunzipSync(raw):raw).toString('utf8'))
  res.writeHead(200,{'content-type':'application/json'});res.end('{}')
})
await new Promise(resolve=>collector.listen(4318,'127.0.0.1',resolve))
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,NEXT_PUBLIC_SENTRY_DSN:'http://'+'a'.repeat(32)+'@127.0.0.1:4318/1',
  VERCEL_ENV:'preview',NEXT_TELEMETRY_DISABLED:'1'}
delete env.SENTRY_AUTH_TOKEN
let app,renamed=false
try {
  execFileSync('npm',['run','build'],{env,stdio:'inherit',timeout:240000})
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'],{env,stdio:'pipe'})
  // Keep logs in memory; do not publish cookies, keys or request payloads.
  let appLog=''
  app.stdout.on('data',c=>{appLog=(appLog+c.toString()).slice(-20000)})
  app.stderr.on('data',c=>{appLog=(appLog+c.toString()).slice(-20000)})
  const base='http://127.0.0.1:3100'
  let ready=false
  for(let i=0;i<60;i++){
    try{if((await fetch(base+'/login')).ok){ready=true;break}}catch{}
    await delay(1000)
  }
  assert.ok(ready,'Next server must start')
  console.log('PASS: built application starts against disposable Supabase')

  await verifyTeamContexts({base,db,status,sql,envelopes})
  await verifyTeamPinBrowser({base,db,status,sql})

  const password=randomUUID()+'aA!9'
  const email='zip-'+randomUUID()+'@example.invalid'
  const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user
  checked(await db.from('app_user_access').insert({user_id:user.id,access_kind:'admin'}))
  const jar=new Map()
  const login=createServerClient(status.API_URL,status.ANON_KEY,{
    cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}
  })
  checked(await login.auth.signInWithPassword({email,password}))
  const cookie=[...jar].map(([name,value])=>name+'='+value).join('; ')
  const headers={cookie}
  const anon=await fetch(base+'/api/admin/inventario',{redirect:'manual'})
  assert.equal(anon.status,307)
  assert.ok(anon.headers.get('location').endsWith('/login'))
  console.log('PASS: unauthenticated inventory export is denied')

  const main=checked(await db.from('warehouses').select('id').eq('name','Main').single())
  const service=checked(await db.from('warehouses').insert({name:'HTTP Service'}).select('id').single())
  const mainCode='006323',serviceCode='HTTP-SERVICE'
  checked(await db.from('inventory_items').insert([
    {brand_code:mainCode,brand_name:'Synthetic Main',category:'Test',category1:'Test',bpu:1,pallet_size:0,weight_avg:0,brand_active:false,warehouse_id:main.id},
    {brand_code:serviceCode,brand_name:'Synthetic Service',category:'Test',category1:'Test',bpu:24,pallet_size:0,weight_avg:0,brand_active:true,warehouse_id:service.id}
  ]))
  checked(await db.from('item_bin_locations').insert([{brand_code:mainCode,bin_location:'40B'},{brand_code:serviceCode,bin_location:'40B'}]))
  const page=await fetch(base+'/admin/inventario',{headers})
  assert.equal(page.status,200)
  assert.match(await page.text(),/Download full inventory/)
  const download=await fetch(base+'/api/admin/inventario',{headers})
  assert.equal(download.status,200)
  assert.match(download.headers.get('content-type'),/application\/zip/)
  const zip=XLSX.CFB.read(Buffer.from(await download.arrayBuffer()),{type:'buffer'})
  const sheets=[]
  for(const entry of zip.FileIndex.filter(e=>e.name.endsWith('.xlsx'))){
    const wb=XLSX.read(entry.content,{type:'buffer'})
    sheets.push(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}))
  }
  const mainRows=sheets.find(rows=>rows.some(r=>r['Brand Code']===mainCode))
  const serviceRows=sheets.find(rows=>rows.some(r=>r['Brand Code']===serviceCode))
  assert.ok(mainRows&&serviceRows)
  assert.ok(!mainRows.some(r=>r['Brand Code']===serviceCode))
  assert.ok(!serviceRows.some(r=>r['Brand Code']===mainCode))
  assert.equal(mainRows.find(r=>r['Brand Code']===mainCode).Status,false)
  assert.equal(mainRows.find(r=>r['Brand Code']===mainCode).WHS,'Main')
  console.log('PASS: authenticated HTTP download contains valid XLSX, separate warehouses, inactive item and leading zeros')

  await verifyRecoveredWarehouse({db,base,headers,cookies:[...jar].map(([name,value])=>({name,value}))})

  await verifyRecoveryPreview({db,base,headers,cookies:[...jar].map(([name,value])=>({name,value}))})

  // Reproduce the user's missing-column incident only in the disposable database.
  sql("alter table public.inventory_items rename column warehouse_id to warehouse_id_test_hidden; notify pgrst, 'reload schema'")
  renamed=true
  let failed
  for(let i=0;i<15;i++){
    failed=await fetch(base+'/api/admin/inventario',{headers})
    if(failed.status===503)break
    await delay(1000)
  }
  assert.equal(failed.status,503)
  const error=await failed.json()
  assert.match(error.error,/database update/)
  assert.match(error.eventId,/^[a-f0-9]{32}$/)
  let envelope
  for(let i=0;i<20;i++){
    envelope=envelopes.find(value=>value.includes(error.eventId)&&value.includes('inventory.zip'))
    if(envelope)break
    await delay(250)
  }
  assert.ok(envelope,'Actual Sentry SDK must deliver the error envelope to the isolated HTTP collector')
  assert.ok(!envelope.includes(email),'No user email in telemetry')
  assert.ok(!envelope.includes(password),'No password in telemetry')
  assert.ok(!envelope.includes(status.SERVICE_ROLE_KEY),'No service key in telemetry')
  assert.ok(!envelope.includes(cookie),'No authentication cookie in telemetry')
  assert.match(appLog,/inventory_export_failed/)
  console.log('PASS: missing schema produces safe HTTP error, correlated real SDK envelope and fallback log')
  console.log('NOTE: collector is isolated; this does not assert receipt in the hosted Sentry account')
} finally {
  if(renamed)sql("alter table public.inventory_items rename column warehouse_id_test_hidden to warehouse_id; notify pgrst, 'reload schema'")
  if(app){app.kill('SIGTERM');app.stdout.destroy();app.stderr.destroy()}
  collector.closeAllConnections()
  await new Promise(resolve=>collector.close(resolve))
}
