import assert from 'node:assert/strict'

// Inventory tabs: one warehouse per tab, never mixed. Also prints timings used to
// decide virtualization (PR 3). Synthetic data in the disposable CI database only.
export async function verifyInventoryTabs({db,base,cookies}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  const checked=r=>{if(r.error)throw Error(r.error.message);return r.data}
  const big=checked(await db.from('warehouses').insert({name:'Tabs Big synthetic'}).select('id').single())
  const small=checked(await db.from('warehouses').insert({name:'Tabs Small synthetic'}).select('id').single())
  const empty=checked(await db.from('warehouses').insert({name:'Tabs Empty synthetic'}).select('id').single())
  const item=(prefix,i,warehouse_id)=>({brand_code:prefix+String(i).padStart(5,'0'),brand_name:'Tabs product '+prefix+i,
    category:'Fresh & General Food',category1:'Food - Sandwiches',bpu:1+(i%24),pallet_size:i%3?0:40,weight_avg:i%5?0:250,
    brand_active:i%5!==0,warehouse_id})
  const bigItems=Array.from({length:2310},(_,i)=>item('TB',i,big.id))
  const smallItems=Array.from({length:240},(_,i)=>item('TS',i,small.id))
  for(let i=0;i<bigItems.length;i+=500)checked(await db.from('inventory_items').insert(bigItems.slice(i,i+500)))
  checked(await db.from('inventory_items').insert(smallItems))
  const bins=bigItems.flatMap((p,i)=>i%2?[{brand_code:p.brand_code,bin_location:'B'+(i%400)}]:[])
  for(let i=0;i<bins.length;i+=500)checked(await db.from('item_bin_locations').insert(bins.slice(i,i+500)))

  // Data-load cost: everything (old screen) vs one warehouse (new screen), same pagination.
  async function pages(filter){
    const t=performance.now();let from=0,n=0
    for(;;){const q=db.from('inventory_items').select('brand_code, brand_name, bpu, pallet_size, weight_avg, category, category1, brand_active')
      const {data}=await (filter?q.eq('warehouse_id',filter):q).order('brand_code').range(from,from+999)
      n+=data.length;if(data.length<1000)break;from+=1000}
    return {ms:Math.round(performance.now()-t),rows:n}
  }
  const all=await pages(null),one=await pages(big.id)
  console.log(`TIMING: items query, all warehouses ${all.rows} rows ${all.ms} ms; one warehouse ${one.rows} rows ${one.ms} ms (disposable DB, no network latency)`)

  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch({headless:true})
  try {
    const context=await browser.newContext({viewport:{width:1366,height:900}})
    await context.addCookies(cookies.map(({name,value})=>({name,value,url:base})))
    const page=await context.newPage()
    const errors=[];page.on('pageerror',()=>errors.push('pageerror'))
    const cdp=await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})

    let t=performance.now()
    await page.goto(base+'/admin/inventario?wh='+big.id)
    await page.getByText('2310 items in Tabs Big synthetic').waitFor()
    await page.getByRole('button',{name:'Edit TB02309'}).waitFor({state:'attached'})
    console.log(`TIMING: big tab (2310 rows) load to full table, CPU 4x: ${Math.round(performance.now()-t)} ms`)

    const tabs=page.getByRole('navigation',{name:'Warehouses'})
    assert.equal(await tabs.getByRole('link',{name:'Tabs Empty synthetic'}).count(),0,'empty warehouse gets no tab')
    assert.equal(await tabs.getByRole('link',{name:'Tabs Big synthetic'}).getAttribute('aria-current'),'page')
    assert.equal(await page.getByRole('button',{name:'Edit TS00000'}).count(),0,'small warehouse items never in big tab')
    assert.equal(await tabs.getByRole('link',{name:/all/i}).count(),0,'no combined tab')

    t=performance.now()
    await page.getByPlaceholder('Code, name or BIN').fill('TB0230')
    await page.getByText(/^10 of 2310 products$/).waitFor()
    console.log(`TIMING: search filter on 2310 rows, CPU 4x: ${Math.round(performance.now()-t)} ms`)

    t=performance.now()
    await tabs.getByRole('link',{name:'Tabs Small synthetic'}).click()
    await page.getByText('240 items in Tabs Small synthetic').waitFor()
    console.log(`TIMING: switch to small tab (240 rows), CPU 4x: ${Math.round(performance.now()-t)} ms`)
    assert.equal(await page.getByRole('button',{name:'Edit TB00000'}).count(),0,'big warehouse items never in small tab')
    assert.equal(await page.getByPlaceholder('Code, name or BIN').inputValue(),'','search resets per tab')
    assert.match(page.url(),new RegExp('wh='+small.id))

    // Unknown or missing tab id falls back to the first warehouse with products, never to "all".
    await page.goto(base+'/admin/inventario?wh=00000000-0000-0000-0000-000000000000')
    assert.equal(await tabs.locator('[aria-current="page"]').count(),1)
    assert.deepEqual(errors,[])
    console.log('PASS: Inventory shows one tab per warehouse with products, never mixed')
  } finally {
    await browser.close()
    await db.from('item_bin_locations').delete().like('brand_code','TB%')
    await db.from('inventory_items').delete().in('warehouse_id',[big.id,small.id])
    await db.from('warehouses').delete().in('id',[big.id,small.id,empty.id])
  }
}
