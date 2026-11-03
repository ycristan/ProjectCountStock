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
    await page.getByRole('button',{name:'Edit TB00000'}).waitFor()
    console.log(`TIMING: big tab (2310 rows) load to full table, CPU 4x: ${Math.round(performance.now()-t)} ms`)

    // Virtualised on the page scroll: only the visible rows are in the DOM; scrolling brings in the last one.
    assert.ok(await page.locator('tbody tr').count()<100,'virtualised table renders few rows')
    assert.equal(await page.getByRole('button',{name:'Edit TB02309'}).count(),0,'last row not rendered before scrolling')
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
    await page.getByRole('button',{name:'Edit TB02309'}).waitFor()
    assert.ok(await page.locator('tbody tr').count()<100,'virtualised table renders few rows after scrolling')

    // Layout: the title and tabs scroll away and the table header sticks to the very top of the screen.
    assert.ok(Math.abs(await page.locator('thead').evaluate(el=>el.getBoundingClientRect().top))<1,'table header sticks to the top of the screen')
    await page.evaluate(()=>window.scrollTo(0,0))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'no sideways scroll at 1366px')
    assert.equal(await page.getByPlaceholder('Code, name or BIN').count(),0,'no generic search box: filters are per column')
    const widths=()=>page.locator('thead th').evaluateAll(ths=>ths.map(th=>Math.round(th.getBoundingClientRect().width)))
    const w0=await widths()
    await page.getByRole('button',{name:'Edit TB00000'}).click()
    await page.getByRole('textbox',{name:'Brand Name',exact:true}).fill('X'.repeat(200))
    assert.deepEqual(await widths(),w0,'editing a row never changes column widths')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,'editing causes no sideways scroll')
    assert.deepEqual((await page.locator('thead th').allTextContents()).map(t=>t.trim()),['Status','Brand Code','Brand Name','Category','Category1','BPU','Pallet Size','Weight AVG','BIN Location','Actions','1','2','3','4'])
    if(process.env.SCREENSHOT_DIR){
      const {mkdirSync}=await import('node:fs');mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true})
      await page.screenshot({path:process.env.SCREENSHOT_DIR+'/inventory-1366-editing.png'}).catch(()=>{})
    }
    await page.getByRole('button',{name:'Cancel'}).click()

    const tabs=page.getByRole('navigation',{name:'Warehouses'})
    assert.equal(await tabs.getByRole('link',{name:'Tabs Empty synthetic'}).count(),0,'empty warehouse gets no tab')
    assert.equal(await tabs.getByRole('link',{name:'Tabs Big synthetic'}).getAttribute('aria-current'),'page')
    assert.equal(await page.getByRole('button',{name:'Edit TS00000'}).count(),0,'small warehouse items never in big tab')
    assert.equal(await tabs.getByRole('link',{name:/^(all|all warehouses|geral)$/i}).count(),0,'no combined tab')

    // Excel-style filters. Brand Code: searching keeps only the ticked search results.
    await page.getByRole('button',{name:'Filter Brand Code'}).click()
    const codeBox=page.getByRole('dialog',{name:'Filter Brand Code'})
    const cb=await codeBox.boundingBox()
    assert.ok(cb.height>=400&&cb.y+cb.height<=900,'filter popover uses the screen height and fits: '+JSON.stringify(cb))
    // Every value is reachable: scrolling the list reaches the last of the 2,310 codes.
    await codeBox.getByText('2310 values').waitFor()
    await codeBox.locator('ul').evaluate(el=>el.parentElement.scrollTop=el.scrollHeight)
    await codeBox.getByLabel('TB02309',{exact:true}).waitFor()
    await codeBox.getByLabel('Search values').fill('TB0230')
    t=performance.now()
    await codeBox.getByRole('button',{name:'Apply'}).click()
    await page.getByText(/^10 of 2310 products$/).waitFor()
    console.log(`TIMING: apply Brand Code search filter on 2310 rows, CPU 4x: ${Math.round(performance.now()-t)} ms`)
    await page.getByRole('button',{name:'Clear all filters'}).click()
    await page.getByText(/^2310 products$/).waitFor()

    // Status AND BPU combine; clearing restores everything.
    await page.getByRole('button',{name:'Filter Status'}).click()
    const filterBox=page.getByRole('dialog',{name:'Filter Status'})
    await filterBox.getByLabel('(Select all)').uncheck()
    await filterBox.getByLabel('Inactive').check()
    t=performance.now()
    await filterBox.getByRole('button',{name:'Apply'}).click()
    await page.getByText('462 of 2310 products').waitFor()
    console.log(`TIMING: apply column filter on 2310 rows, CPU 4x: ${Math.round(performance.now()-t)} ms`)
    await page.getByRole('button',{name:'Filter BPU'}).click()
    const bpuBox=page.getByRole('dialog',{name:'Filter BPU'})
    await bpuBox.getByLabel('(Select all)').uncheck()
    await bpuBox.getByLabel('Search values').fill('24')
    await bpuBox.getByLabel('24',{exact:true}).check()
    await bpuBox.getByRole('button',{name:'Apply'}).click()
    let both=0
    for(let i=0;i<2310;i++) if(i%5===0&&i%24===23) both++
    await page.getByText(`${both} of 2310 products`).waitFor()
    await page.getByRole('button',{name:'Clear all filters'}).click()
    await page.getByText(/^2310 products$/).waitFor()
    assert.equal(await page.getByRole('button',{name:'Clear all filters'}).count(),0,'clear button gone once nothing is filtered')

    t=performance.now()
    await tabs.getByRole('link',{name:'Tabs Small synthetic'}).click()
    await page.getByText('240 items in Tabs Small synthetic').waitFor()
    console.log(`TIMING: switch to small tab (240 rows), CPU 4x: ${Math.round(performance.now()-t)} ms`)
    assert.equal(await page.getByRole('button',{name:'Edit TB00000'}).count(),0,'big warehouse items never in small tab')
    await page.getByText(/^240 products$/).waitFor()
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
