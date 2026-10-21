import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// UI selection only; fixtures and Auth are confined to the disposable CI database.
export async function verifySoloListBrowser({db,base,cookies}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  const checked=r=>{if(r.error)throw Error(r.error.message);return r.data}
  const warehouse=checked(await db.from('warehouses').insert({name:'Solo list synthetic'}).select('id').single())
  const other=checked(await db.from('warehouses').insert({name:'Solo list other'}).select('id').single())
  const products=Array.from({length:10},(_,i)=>({
    brand_code:'solo-list-'+String(i).padStart(2,'0'),brand_name:'Kinder list synthetic '+i,
    category:'Test',category1:'Test',bpu:24,pallet_size:0,weight_avg:0,
    brand_active:i===9,warehouse_id:warehouse.id
  }))
  checked(await db.from('inventory_items').insert([...products,{
    ...products[0],brand_code:'solo-list-other',warehouse_id:other.id
  }]))
  const existing=checked(await db.from('app_user_access').select('user_id').eq('access_kind','solo_counter').maybeSingle())
  let createdUser
  if(!existing){
    createdUser=checked(await db.auth.admin.createUser({
      email:'solo-list-'+randomUUID()+'@example.invalid',password:randomUUID()+'aA!9',email_confirm:true
    })).user.id
    checked(await db.from('app_user_access').insert({user_id:createdUser,access_kind:'solo_counter'}))
  }
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch({headless:true})
  try {
    const context=await browser.newContext()
    await context.addCookies(cookies.map(({name,value})=>({name,value,url:base})))
    const page=await context.newPage()
    const errors=[]
    page.on('pageerror',()=>errors.push('pageerror'))
    await page.goto(base+'/admin/sessao/solo')
    await page.getByLabel('Warehouse').selectOption(warehouse.id)
    await page.getByPlaceholder('e.g. Aisle 3 spot check').fill('Synthetic restricted selection')
    await page.getByRole('button',{name:'Next →',exact:true}).click()
    await page.getByRole('button',{name:'Solo counter',exact:true}).click()
    await page.getByRole('button',{name:'Next →',exact:true}).click()
    await page.getByRole('button',{name:'Restricted list',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'Next →',exact:true}).isDisabled(),true)
    const search=page.getByPlaceholder('Search item to add to the list...')
    const active=page.getByRole('region',{name:'Active products',exact:true})
    const inactive=page.getByRole('region',{name:'Inactive products',exact:true})
    await search.fill('  KiNdEr list  ')
    await active.getByRole('button').waitFor()
    assert.equal(await active.getByRole('button').count(),1)
    assert.equal(await inactive.getByRole('button').count(),9,'results must not be truncated at eight')
    assert.deepEqual(await page.getByRole('heading',{level:3}).allTextContents(),['Item list','Active','Inactive'])
    assert.equal(await active.getByRole('button').evaluate(el=>el.classList.contains('bg-green-50')),true)
    assert.equal(await inactive.getByRole('button').first().evaluate(el=>el.classList.contains('bg-red-50')),true)
    assert.doesNotMatch(await page.locator('body').innerText(),/solo-list-other/)

    // Inactive selection, exclusion of an already selected code, removal and re-add.
    await inactive.getByRole('button').filter({hasText:'solo-list-00'}).click()
    await page.getByRole('button',{name:'Remove solo-list-00',exact:true}).waitFor()
    assert.equal(await search.inputValue(),'')
    await search.fill('solo-list-00')
    assert.equal(await page.getByRole('region').getByRole('button').count(),0)
    await page.getByRole('button',{name:'Remove solo-list-00',exact:true}).click()
    await inactive.getByRole('button').waitFor()
    assert.equal(await inactive.getByRole('button').count(),1)
    assert.equal(await active.getByRole('button').count(),0)
    await inactive.getByRole('button').click()
    await search.fill('solo-list-09')
    await active.getByRole('button').waitFor()
    await active.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button',{name:'Remove solo-list-09',exact:true}).waitFor()
    await search.fill('no-match-synthetic')
    assert.equal(await page.getByRole('region').getByRole('button').count(),0)
    await page.getByRole('button',{name:'Next →',exact:true}).click()
    await page.getByText('Restricted (2 items)',{exact:true}).waitFor()
    await page.getByRole('button',{name:'← Back',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:/^Remove solo-list-/}).count(),2)
    assert.equal(errors.length,0)
    console.log('PASS: Chromium restricted Solo list groups Active/Inactive, shows >8 matches, preserves WH scope, selects both statuses, prevents duplicates, removes/re-adds and retains review selection.')
  } finally {
    await browser.close()
    checked(await db.from('inventory_items').delete().in('warehouse_id',[warehouse.id,other.id]))
    checked(await db.from('warehouses').delete().in('id',[warehouse.id,other.id]))
    if(createdUser)checked(await db.auth.admin.deleteUser(createdUser))
  }
}
