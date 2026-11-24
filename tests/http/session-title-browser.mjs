// Team session title through the real admin form, real Auth and Postgres, disposable runner only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function verifySessionTitleBrowser({base,db,status}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  assert.equal(new URL(status.API_URL).origin,'http://127.0.0.1:54321')
  const checked=r=>{if(r.error)throw new Error('Isolated fixture failed');return r.data}
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch()
  let stage='fixture'
  try {
    const email='title-admin-'+randomUUID()+'@example.invalid',password=randomUUID()+'aA!9'
    const admin=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user
    checked(await db.from('app_user_access').insert({user_id:admin.id,access_kind:'admin'}))
    const wh=checked(await db.from('warehouses').insert({name:'Title '+randomUUID()}).select('id').single())
    const title='End Of Year Count '+randomUUID().slice(0,8)
    const page=await (await browser.newContext()).newPage()
    page.setDefaultTimeout(30000)

    stage='admin login'
    await page.goto(base+'/login')
    await page.getByRole('button',{name:'Log In as Admin',exact:true}).click()
    await page.locator('[name="email"]').fill(email)
    await page.locator('[name="password"]').fill(password)
    await page.getByRole('button',{name:'Log In',exact:true}).click()
    await page.waitForURL(base+'/admin')

    stage='the new session form asks for a title'
    await page.goto(base+'/admin/sessao/team')
    assert.equal(await page.locator('[name="title"]').getAttribute('required'),'','title is required')
    await page.selectOption('select[name="warehouse_id"]',wh.id)
    await page.locator('[name="title"]').fill('   '+title+'   ')
    await page.getByRole('button',{name:'Create Session',exact:true}).click()
    await page.waitForURL(/\/admin\/sessao\/[0-9a-f-]+\/equipes/)

    stage='the title is saved and shown'
    await page.getByRole('heading',{name:title,exact:true}).waitFor()
    const stored=checked(await db.from('count_sessions').select('id,title').eq('warehouse_id',wh.id).single())
    assert.equal(stored.title,title,'saved trimmed')
    await page.goto(base+'/admin/sessoes')
    await page.getByText(title,{exact:true}).waitFor()
    await page.goto(base+'/admin')
    await page.getByText(title).first().waitFor()
    console.log('PASS: team session title is required in the form, saved trimmed and shown in the session list and on the home')
  } catch (error) {
    throw new Error('Session title browser check failed at: '+stage,{cause:error})
  } finally {
    await browser.close()
  }
}
