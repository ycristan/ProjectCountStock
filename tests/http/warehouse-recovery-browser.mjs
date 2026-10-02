import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'

// Consumes only the synthetic repair fixture created earlier in this CI job.
export async function verifyRecoveredWarehouse({db,base,headers,cookies}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(base,'http://127.0.0.1:3100')
  const checked=r=>{if(r.error)throw Error(r.error.message);return r.data}
  const target='00000000-0000-0000-0000-00000000a102'
  const solo=checked(await db.from('solo_sessions').insert({
    title:'Recovered warehouse browser test',warehouse_id:target,status:'open',restrict_to_list:false
  }).select('id').single())
  const {chromium}=await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
  const browser=await chromium.launch({headless:true})
  try {
    const context=await browser.newContext()
    await context.addCookies(cookies.map(({name,value})=>({name,value,url:base})))
    const page=await context.newPage()
    const errors=[]
    page.on('pageerror',()=>errors.push('pageerror'))
    await page.goto(base+'/admin/solo/'+solo.id)
    const search=page.getByPlaceholder('Brand Code (e.g. 6323), Name or BIN (e.g. 40A02)')
    await search.fill('kinder')
    const active=page.getByRole('region',{name:'Active products',exact:true})
    const inactive=page.getByRole('region',{name:'Inactive products',exact:true})
    await inactive.getByRole('button').filter({hasText:'1213'}).waitFor()
    assert.equal(await active.getByRole('button').count(),1)
    assert.equal(await inactive.getByRole('button').count(),6)
    for(const code of ['9816','9767','6152','2746','1231','1213']) {
      assert.equal(await inactive.getByRole('button').filter({hasText:code}).count(),1)
    }
    assert.match(await active.innerText(),/9888/)
    await search.fill('KiNdEr')
    assert.equal(await inactive.getByRole('button').count(),6)
    await search.fill('1213')
    await inactive.getByRole('button').filter({hasText:'1213'}).waitFor()
    assert.equal(await active.getByRole('button').count(),0)
    assert.equal(await inactive.getByRole('button').count(),1)
    await inactive.getByRole('button').click()
    assert.equal(await search.count(),0,'inactive product must open the count form')
    await page.getByText('Kinder synthetic 1213',{exact:true}).waitFor()
    await page.goto(base+'/admin/solo/'+solo.id)
    await search.fill('40B')
    await inactive.getByRole('button').filter({hasText:'1213'}).waitFor()
    assert.equal(await active.getByRole('button').count(),1)
    assert.equal(await inactive.getByRole('button').count(),1)
    assert.doesNotMatch(await page.locator('body').innerText(),/repair-other/)
    await search.fill('Other warehouse')
    await page.getByText(/No items found/).waitFor()
    assert.equal(await page.getByRole('region').getByRole('button').count(),0)
    await page.goto(base+'/admin/sessao/00000000-0000-0000-0000-00000000a106/combinacao')
    await page.getByRole('button',{name:'Merged',exact:true}).click()
    await page.getByText('Kinder synthetic 1213',{exact:true}).first().waitFor()
    assert.equal(errors.length,0,'browser must have no uncaught errors')
    await context.close()
    console.log('PASS: Chromium solo search shows 1 Active + 6 Inactive Kinder; code/BIN search and inactive selection work; Service excluded; historical team page keeps product name.')
  } finally {
    await browser.close()
    checked(await db.from('solo_sessions').update({status:'closed'}).eq('id',solo.id))
  }
  const team=await fetch(base+'/api/sessao/00000000-0000-0000-0000-00000000a106/export',{headers})
  assert.equal(team.status,200)
  const wb=XLSX.read(Buffer.from(await team.arrayBuffer()),{type:'buffer'})
  const rows=XLSX.utils.sheet_to_json(wb.Sheets.Consolidado,{header:1})
  const row=rows.find(row=>row[2]==='1213')
  assert.ok(row)
  assert.equal(row[3],'Kinder synthetic 1213')
  assert.equal(row[4],24)
  assert.equal(row.at(-2),2)
  assert.equal(row.at(-1),0)
  assert.ok(!rows.some(row=>row[2]==='repair-other'))
  const soloExport=await fetch(base+'/api/solo/00000000-0000-0000-0000-00000000a105/export',{headers})
  assert.equal(soloExport.status,200)
  const soloBook=XLSX.read(Buffer.from(await soloExport.arrayBuffer()),{type:'buffer'})
  const soloRows=XLSX.utils.sheet_to_json(soloBook.Sheets[soloBook.SheetNames[0]],{header:1})
  const saved=soloRows.find(row=>row[2]==='1213')
  assert.equal(saved[3],'Historic name')
  assert.equal(saved[4],24)
  assert.equal(saved[5],2)
  console.log('PASS: actual HTTP/XLSX closed team and solo exports retain product details and stored quantities after recovery.')
}
