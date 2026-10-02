// Same launcher as Codespaces, exercised against the disposable Actions database.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { startLab, labFailure } from '../../scripts/codespace-lab.mjs'
import { verifyTeamCountBrowser } from '../http/team-count-browser.mjs'
assert.equal(process.env.GITHUB_ACTIONS,'true')
const privateText='password=DO_NOT_LOG secret=DO_NOT_LOG'
assert.match(labFailure('startup',{status:1,stderr:'client version 1.41 is too old; '+privateText}),/Docker API version incompatibility/)
assert.match(labFailure('startup',{status:1,stderr:'bind: address already in use '+privateText}),/local port/)
assert.ok(!labFailure('startup',{status:1,stderr:privateText}).includes('DO_NOT_LOG'))
assert.ok(!labFailure('startup',{status:1,stderr:'too many requests '+privateText}).includes('DO_NOT_LOG'))
let stage='start',browser
const lab=await startLab({check:true})
const {base,db,status,admins,warehouses,work}=lab
try{
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  browser=await chromium.launch()
  let realtimeFrames=0
  const newContext=browser.newContext.bind(browser)
  browser.newContext=async options=>{
    const ctx=await newContext(options)
    ctx.on('page',p=>p.on('websocket',ws=>{
      if(ws.url().includes('/__supabase/realtime/v1/'))ws.on('framereceived',()=>realtimeFrames++)
    }))
    return ctx
  }
  const context=await browser.newContext(),page=await context.newPage()
  page.setDefaultTimeout(45000)
  stage='real administrator login'
  await page.goto(base+'/login')
  await page.getByRole('button',{name:'Log In as Admin',exact:true}).click()
  await page.locator('[name="email"]').fill(admins[0].email)
  await page.locator('[name="password"]').fill(admins[0].password)
  await page.getByRole('button',{name:'Log In',exact:true}).click()
  await page.waitForURL(base+'/admin')
  const require=createRequire(join(work,'package.json'))
  const {createServerClient}=require('@supabase/ssr')
  const cookies=new Map()
  const login=createServerClient(status.API_URL,status.ANON_KEY,{
    cookieOptions:{name:'sb-count-stock-lab-auth-token'},
    cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>cookies.set(c.name,c.value))}
  })
  assert.ok(!(await login.auth.signInWithPassword(admins[0])).error)
  const query=await page.evaluate(async()=>{const r=await fetch('/__supabase/auth/v1/settings');return r.status})
  assert.ok(query===200||query===401)
  assert.equal((await fetch(base+'/__supabase/pg/meta')).status,400)
  const checked=r=>{if(r.error)throw new Error('Synthetic fixture failed');return r.data}
  const wh=warehouses[0],session=checked(await db.from('count_sessions').insert({warehouse_id:wh.id}).select('id').single())
  stage='variable setup through real Server Actions'
  await page.goto(base+'/admin/sessao/'+session.id+'/equipes?flow=2&n=3')
  await page.getByRole('heading',{name:'Configure Variable Teams'}).waitFor()
  for(let i=0;i<3;i++){
    const fieldset=page.locator('fieldset').nth(i)
    for(let j=0;j<i;j++)await fieldset.getByRole('button',{name:'Add counter',exact:true}).click()
    await page.locator('[name="team_'+i+'_name"]').fill('Lab test team '+i)
    for(let j=0;j<i+3;j++)await page.locator('[name="team_'+i+'_member_'+j+'"]').fill('Lab person '+i+' '+j)
  }
  await page.getByRole('button',{name:'Create Teams and Generate Logins',exact:true}).click()
  await page.getByRole('heading',{name:'Logins Generated',exact:true}).waitFor()
  const plan=checked(await login.rpc('read_team_setup',{p_session:session.id})).plan
  const sql=command=>execFileSync('psql',['-v','ON_ERROR_STOP=1','-c',command],{
    env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGUSER:'postgres',PGPASSWORD:'postgres',PGDATABASE:'postgres'},stdio:'pipe'})
  stage='counting, blind roles and realtime via private same-origin gateway'
  await verifyTeamCountBrowser({base,db,status,sql,login,browser,page,plan,session,wh})
  assert.ok(realtimeFrames>0,'Native WebSocket must receive frames through the lab gateway')
  console.log('PASS: laboratory launcher, real admin/PIN/SSR actions, 3/4/5 counting regression and native proxied WebSocket; no hosted keys')
}catch(e){
  if(e.message?.startsWith('Team count browser verification failed'))throw e
  throw new Error('Lab browser verification failed at: '+stage)
}finally{if(browser)await browser.close();await lab.close()}
