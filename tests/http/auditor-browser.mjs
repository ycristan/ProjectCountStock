// Auditor in a real browser, real Auth and Postgres, disposable runner only. Synthetic data.
// The Auditor sees the live count and nothing else: no link or button into a team or the admin
// area, every other route sends them back, and a revoked access shows nothing.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pinPassword } from '../../lib/pin-credentials.ts'

export async function verifyAuditorBrowser({base,db,status,sql}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const checked=r=>{if(r.error)throw new Error('Isolated fixture failed');return r.data}
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch()
  let stage='fixture'
  try {
    const wh=checked(await db.from('warehouses').insert({name:'Auditor '+randomUUID()}).select('id').single())
    const session=checked(await db.from('count_sessions').insert({warehouse_id:wh.id}).select('id').single())
    const teamId=randomUUID()
    sql("insert into public.teams(id,session_id,team_name) values('"+teamId+"','"+session.id+"','Auditor team'); insert into public.team_flows(team_id) values('"+teamId+"')")
    const code='9001',pin='9002'
    const user=checked(await db.auth.admin.createUser({email:code+pin+'@count.local',password:pinPassword(code,pin),email_confirm:true})).user
    checked(await db.from('app_user_access').insert({user_id:user.id,access_kind:'auditor'}))
    checked(await db.from('session_auditors').insert({session_id:session.id,user_id:user.id,team_code:code,pin}))

    stage='auditor login with the two PINs'
    const page=await (await browser.newContext()).newPage()
    page.setDefaultTimeout(30000)
    await page.goto(base+'/login')
    await page.locator('[name="team_pin"]').fill(code)
    await page.locator('[name="user_pin"]').fill(pin)
    await page.getByRole('button',{name:'Log In',exact:true}).click()
    await page.waitForURL(base+'/auditor')

    stage='live count without any way into a team or the admin area'
    await page.getByText('Auditor team').first().waitFor()
    assert.equal(await page.locator('a[href^="/team"]').count(),0,'no link to a team screen')
    assert.equal(await page.locator('a[href^="/admin"]').count(),0,'no link to the admin area')
    console.log('PASS: Auditor logs in with the two PINs and sees only the live count, with no team or admin link')

    stage='every other route sends the Auditor back'
    for(const path of ['/','/admin','/admin/sessao/'+session.id+'/ao-vivo','/admin/sessao/'+session.id+'/equipes','/team','/team/'+teamId,'/busca','/solo']){
      await page.goto(base+path)
      assert.equal(new URL(page.url()).pathname,'/auditor','Auditor is sent back from '+path)
    }
    console.log('PASS: Auditor cannot open admin, team, counter or solo screens')

    stage='revoked access shows nothing'
    sql("update public.session_auditors set revoked_at=now() where session_id='"+session.id+"'")
    await page.goto(base+'/auditor')
    await page.getByText('This access has ended or is unavailable.').waitFor()
    assert.equal(await page.getByText('Auditor team').count(),0,'a revoked Auditor sees no team')
    await page.goto(base+'/admin')
    assert.notEqual(new URL(page.url()).pathname,'/admin','a revoked Auditor still cannot open the admin area')
    console.log('PASS: revoked Auditor sees no count and still cannot open the admin area')
  } catch (error) {
    throw new Error('Auditor browser check failed at: '+stage,{cause:error})
  } finally {
    await browser.close()
  }
}
