import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function verifyRecoveryPreview({db,base,headers,cookies}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  const checked=r=>{if(r.error)throw Error(r.error.message);return r.data}
  const source=randomUUID(),target=randomUUID()
  checked(await db.from('warehouses').insert([{id:source,name:'Preview legacy'}, {id:target,name:'Preview destination'}]))
  const rows=['1213','1231','2746','6152','9767','9816'].map(code=>({
    brand_code:'preview-'+code,brand_name:'Kinder preview '+code,bpu:24,pallet_size:0,weight_avg:30,category:'Test',category1:'Test',brand_active:false,warehouse_id:source,
  }))
  rows.push({...rows[0],brand_code:'preview-9888',brand_name:'Kinder preview active',brand_active:true,warehouse_id:target})
  rows.push({...rows[0],brand_code:'preview-omitted',brand_name:'Previously active omitted',brand_active:true})
  checked(await db.from('inventory_items').insert(rows))
  checked(await db.from('item_bin_locations').insert({brand_code:'preview-1213',bin_location:'40B'}))
  const snapshot=async()=>JSON.stringify(checked(await db.from('inventory_items').select('*').in('warehouse_id',[source,target]).order('brand_code')))
  const before=await snapshot()
  const path='/admin/inventario/recovery-preview?source='+source+'&target='+target
  assert.equal((await fetch(base+path,{redirect:'manual'})).status,307)
  assert.equal((await fetch(base+'/admin/inventario/recovery-preview?source=invalid',{headers})).status,404)
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch({headless:true})
  try {
    const context=await browser.newContext()
    await context.addCookies(cookies.map(({name,value})=>({name,value,url:base})))
    const page=await context.newPage()
    const writes=[],errors=[]
    page.on('request',request=>{
      if(request.method()==='GET'||request.method()==='HEAD')return
      const url=new URL(request.url())
      // The app's real Sentry SDK posts to the isolated collector configured
      // by inventory-export.mjs. That is telemetry, never an inventory write.
      if(url.origin==='http://127.0.0.1:4318'&&url.pathname==='/api/1/envelope/')return
      writes.push({method:request.method(),origin:url.origin,path:url.pathname})
    })
    page.on('pageerror',()=>errors.push('error'))
    await page.goto(base+path)
    await page.getByText('PREVIEW SOMENTE LEITURA — NÃO APLICADA',{exact:true}).waitFor()
    const active=page.getByRole('region',{name:'Active products',exact:true})
    const inactive=page.getByRole('region',{name:'Inactive products',exact:true})
    await inactive.getByRole('button').filter({hasText:'preview-1213'}).waitFor()
    assert.equal(await active.getByRole('button').count(),1)
    assert.equal(await inactive.getByRole('button').count(),6)
    await page.getByRole('button',{name:'Antes — dados atuais',exact:true}).click()
    assert.equal(await active.getByRole('button').count(),1)
    assert.equal(await inactive.getByRole('button').count(),0)
    await page.getByRole('button',{name:'Depois — projeção da recuperação',exact:true}).click()
    assert.equal(await inactive.getByRole('button').count(),6)
    await inactive.getByRole('button').filter({hasText:'preview-1213'}).click()
    await page.getByRole('complementary',{name:'Product details'}).waitFor()
    assert.equal(await page.getByRole('button',{name:/Confirm Count/}).count(),0)
    const search=page.getByPlaceholder('Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)')
    await search.fill('40B')
    assert.equal(await inactive.getByRole('button').count(),1)
    await search.fill('Previously active omitted')
    assert.equal(await active.getByRole('button').count(),0)
    assert.equal(await inactive.getByRole('button').count(),1)
    assert.deepEqual(writes,[],'read-only interactions must make no non-telemetry write requests')
    assert.equal(errors.length,0)
    // The operational recovery fixture has an empty historical source. Both
    // real new-session screens must omit it, retaining inactive-only Main.
    for(const route of ['/admin/sessao/team','/admin/sessao/solo']) {
      await page.goto(base+route)
      const options=await page.locator('select option').allTextContents()
      assert.ok(!options.includes('Repair Main'))
      assert.ok(options.includes('Repair BDS Main Warehouse'))
      assert.ok(options.includes('Main'),'warehouse containing only an inactive item remains selectable')
    }
    assert.equal(await snapshot(),before,'preview must not change inventory')
    console.log('PASS: real browser recovery preview: before=1, after=7, inactive details/BIN, no writes; empty legacy warehouse omitted from both session selectors, inactive-only warehouse retained.')
  } finally {await browser.close()}
}
