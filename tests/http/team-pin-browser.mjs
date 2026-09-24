// Browser, Next Server Actions and real Auth/Postgres in the disposable runner.
// No traces, screenshots of login cards, cookies or PINs are published.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { pinPassword, generatePin } from '../../lib/pin-credentials.ts'

export async function verifyTeamPinBrowser({base,db,status,sql}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch()
  let stage='fixture'
  const checked=r=>{if(r.error)throw new Error('Fixture operation failed');return r.data}
  const email='browser-admin-'+randomUUID()+'@example.invalid',password=randomUUID()+'aA!9'
  const adminUser=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user
  checked(await db.from('app_user_access').insert({user_id:adminUser.id,access_kind:'admin'}))
  const wh=checked(await db.from('warehouses').select('id').eq('name','Main').single())
  const session=checked(await db.from('count_sessions').insert({warehouse_id:wh.id}).select('id').single())
  const code='BROWSER-'+randomUUID()
  checked(await db.from('inventory_items').insert({brand_code:code,brand_name:'Browser proof product',
    category:'Test',category1:'Test',bpu:10,pallet_size:0,weight_avg:0,brand_active:true,warehouse_id:wh.id}))
  const errors=[]
  const pages=[]
  const secrets=[email,password,status.ANON_KEY,status.SERVICE_ROLE_KEY]
  const safe=value=>secrets.filter(Boolean).reduce((s,secret)=>s.split(secret).join('[redacted]'),String(value)).slice(0,1200)
  async function pageForRole(){
    const context=await browser.newContext()
    const page=await context.newPage()
    pages.push(page)
    page.setDefaultTimeout(20000)
    page.on('pageerror',()=>errors.push('pageerror'))
    return page
  }
  async function pinLogin(page,teamPin,userPin){
    await page.goto(base+'/login')
    await page.locator('[name="team_pin"]').fill(teamPin)
    await page.locator('[name="user_pin"]').fill(userPin)
    await page.getByRole('button',{name:'Log In',exact:true}).click()
  }
  try {
    stage='admin browser login'
    const adminPage=await pageForRole()
    await adminPage.goto(base+'/login')
    stage='admin mode button'
    await adminPage.getByRole('button',{name:'Log In as Admin',exact:true}).click()
    stage='admin email field'
    await adminPage.locator('[name="email"]').fill(email)
    stage='admin password field'
    await adminPage.locator('[name="password"]').fill(password)
    stage='admin login submit'
    await adminPage.getByRole('button',{name:'Log In',exact:true}).click()
    stage='admin redirect'
    await adminPage.waitForURL(base+'/admin')

    stage='create legacy team through real form'
    await adminPage.goto(base+'/admin/sessao/'+session.id+'/equipes?n=1')
    await adminPage.locator('[name="team_0_name"]').fill('Browser team')
    for(const role of ['c1','c2','ind'])await adminPage.locator('[name="team_0_'+role+'"]').fill('Synthetic '+role)
    await adminPage.getByRole('button',{name:'Create Teams and Generate Logins',exact:true}).click()
    await adminPage.getByRole('heading',{name:'Logins Generated',exact:true}).waitFor()
    const rows=await adminPage.locator('tbody tr').evaluateAll(rows=>rows.map(r=>[...r.querySelectorAll('td')].map(c=>c.textContent.trim())))
    for(const row of rows)secrets.push(row[1],row[4])
    assert.equal(rows.length,3)
    for(const row of rows){assert.ok(/^\d{4}$/.test(row[1]));assert.ok(/^\d{4}$/.test(row[4]))}
    assert.equal(new Set(rows.map(r=>r[4])).size,3)
    const team=checked(await db.from('teams').select('id').eq('session_id',session.id).single())
    const accounts=checked(await db.from('counter_accounts').select('auth_user_id,role').eq('team_id',team.id))
    assert.equal(accounts.length,3)
    assert.equal(checked(await db.from('team_flows').select('team_id').eq('team_id',team.id)).length,0)
    console.log('PASS: real admin UI creates three legacy logins with four-digit cards; no implicit new-flow conversion')

    stage='independent browser login'
    const ind=await pageForRole()
    await pinLogin(ind,rows[2][1],rows[2][4])
    await ind.waitForURL(base+'/monitor')
    await ind.getByRole('heading',{name:'Live Count Monitor',exact:true}).waitFor()
    assert.equal(await ind.getByRole('link',{name:'Finalise',exact:true}).count(),0)
    await ind.getByRole('link',{name:'Products',exact:true}).click()
    await ind.getByText('Product consultation only.',{exact:false}).waitFor()
    await ind.getByPlaceholder('Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)').fill('Browser proof')
    await ind.getByRole('button',{name:new RegExp(code)}).click()
    assert.equal(await ind.getByRole('button',{name:/Add to Count|Edit Count|Confirm Count/}).count(),0)
    await ind.getByRole('button',{name:'Cancel',exact:true}).click()
    await ind.goto(base+'/finalizar')
    await ind.waitForURL(base+'/monitor')
    console.log('PASS: PIN login sends independent to monitor; product consultation works without count/finalise controls')

    let actionRequest
    for(let i=0;i<2;i++){
      stage='counter '+(i+1)+' browser count'
      const counter=await pageForRole()
      await pinLogin(counter,rows[i][1],rows[i][4])
      await counter.waitForURL(base+'/busca')
      await counter.getByPlaceholder('Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)').fill('Browser proof')
      await counter.getByRole('button',{name:new RegExp(code)}).click()
      // Fresh counter must not see the other's saved value.
      assert.equal(await counter.getByText('Registered Count',{exact:true}).count(),0)
      await counter.locator('input[type="number"]').nth(1).fill(String(i+2))
      counter.on('request',req=>{
        if(req.method()==='POST'&&req.headers()['next-action'])
          actionRequest={id:req.headers()['next-action'],body:req.postData()}
      })
      await counter.getByRole('button',{name:'Confirm Count',exact:true}).click()
      let entry
      for(let n=0;n<30;n++){
        entry=checked(await db.from('count_entries').select('cases,final_cases').eq('team_id',team.id)
          .eq('counter_role',i===0?'contador_1':'contador_2').eq('brand_code',code).maybeSingle())
        if(entry)break
        await delay(200)
      }
      assert.ok(entry)
      assert.equal(entry.cases,i+2)
      // Monitor stays open. This checks a real Realtime event, not a manual refresh.
      await ind.getByRole('cell',{name:(i+2)+'+0',exact:true}).waitFor()
    }
    console.log('PASS: both counters save through UI while independent receives real Realtime updates')

    stage='independent direct Server Action denial'
    assert.ok(actionRequest)
    const denied=await ind.request.post(base+'/busca',{
      headers:{'Next-Action':actionRequest.id,Origin:base,'Content-Type':'text/plain;charset=UTF-8'},
      data:actionRequest.body
    })
    assert.ok((await denied.text()).includes('Independent monitors counts'))
    stage='independent direct Data API denial'
    const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    checked(await client.auth.signInWithPassword({email:rows[2][1]+rows[2][4]+'@count.local',password:pinPassword(rows[2][1],rows[2][4])}))
    const deniedInsert=await client.from('count_entries').insert({team_id:team.id,counter_role:'independente',
      brand_code:code,pallets:0,cases:9,units:0,final_cases:9,final_units:0,is_joint_recount:false})
    assert.ok(deniedInsert.error)
    assert.equal(checked(await db.from('count_entries').select('id').eq('team_id',team.id).eq('counter_role','independente')).length,0)
    console.log('PASS: independent direct Server Action and Data API writes denied; no initial count created')

    stage='forged role cannot change routing'
    const c1=accounts.find(a=>a.role==='contador_1')
    checked(await db.auth.admin.updateUserById(c1.auth_user_id,{user_metadata:{counter_role:'independente',team_id:randomUUID()}}))
    const forged=await pageForRole()
    await pinLogin(forged,rows[0][1],rows[0][4])
    await forged.waitForURL(base+'/busca')
    await forged.goto(base+'/monitor')
    await forged.waitForURL(base+'/busca')
    console.log('PASS: editable role/team metadata cannot turn counter into independent')

    stage='wrong PIN'
    const wrong=await pageForRole()
    const unused=generatePin(new Set(rows.map(r=>r[4])))
    secrets.push(unused)
    await pinLogin(wrong,rows[0][1],unused)
    await wrong.getByText('Invalid code or PIN.',{exact:true}).waitFor()
    assert.ok(wrong.url().endsWith('/login'))

    stage='historical short password compatibility'
    // Only synthetic Auth fixture: emulate a pre-policy account without weakening Auth config.
    // Never reset a real credential. All writes are in the disposable local database.
    const oldPin=generatePin(new Set())
    const oldTeam=generatePin(new Set(rows.map(r=>r[1])))
    secrets.push(oldPin,oldTeam)
    const legacy=checked(await db.auth.admin.createUser({email:oldTeam+oldPin+'@count.local',password:randomUUID()+'aA!9',email_confirm:true})).user
    sql("update auth.users set encrypted_password=extensions.crypt('"+oldPin+"',extensions.gen_salt('bf')) where id='"+legacy.id+"'")
    // Authorized legacy participant identity; no UI-created team is rewritten.
    const legacyTeam=checked(await db.from('teams').insert({session_id:session.id,team_name:'Historical fixture',team_pin:oldTeam}).select('id').single())
    checked(await db.from('counter_accounts').insert({auth_user_id:legacy.id,team_id:legacyTeam.id,role:'contador_1',username:oldTeam+oldPin,user_pin:oldPin}))
    checked(await db.from('app_user_access').insert({user_id:legacy.id,access_kind:'team_counter'}))
    const oldPage=await pageForRole()
    await pinLogin(oldPage,oldTeam,oldPin)
    await oldPage.waitForURL(base+'/busca')
    await oldPage.getByRole('heading',{name:'Search Item',exact:true}).waitFor()
    console.log('PASS: wrong PIN is rejected; historical four-digit password still logs in through real UI')
    assert.equal(errors.length,0,'Browser must have no uncaught page errors')
  } catch (error) {
    console.error('browser_boundary_failed', {stage, message:safe(error.message),
      path:new URL(pages.at(-1)?.url() || base).pathname, pageErrors:errors.length})
    // Browser errors can contain fill values or response bodies. Publish only the failed boundary.
    throw new Error('Team PIN browser verification failed at: '+stage)
  } finally {
    await browser.close()
  }
}
