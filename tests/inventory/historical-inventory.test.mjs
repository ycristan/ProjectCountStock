import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSource } from './source-fixture.mjs'

async function fixture(fail=false) {
  const calls=[]
  const db={from(table) {
    assert.equal(table,'inventory_items')
    let batch=[]
    const query={
      select(fields){assert.equal(fields,'brand_code, brand_name, bpu, category, category1');return query},
      in(field,codes){assert.equal(field,'brand_code');batch=[...codes];return query},
      order(field){assert.equal(field,'brand_code');return query},
      range(from,to){calls.push({batch,from,to});if(fail)throw Error('Read failure');return {data:batch.map(brand_code=>({brand_code,brand_name:'Preserved',bpu:24})),error:null}},
    }
    return query
  }}
  const pagination=await loadSource('lib/fetch-all-rows.ts')
  const module=await loadSource('lib/historical-inventory.ts',{
    'server-only':{},
    '@/lib/fetch-all-rows':{fetchAllRows:pagination.fetchAllRows},
  })
  return {module,db,calls}
}
test('historical lookup uses recorded codes rather than current warehouse',async()=>{
  const f=await fixture()
  const rows=await f.module.loadHistoricalInventory(f.db,['1213','9888','1213'])
  assert.deepEqual(Array.from(rows,r=>r.brand_code),['1213','9888'])
  assert.equal(rows[0].bpu,24)
  assert.equal(f.calls.length,1)
})
test('historical inventory batches long lists without omission or duplicate rows',async()=>{
  const f=await fixture()
  const codes=Array.from({length:1205},(_,i)=>'code-'+i)
  const rows=await f.module.loadHistoricalInventory(f.db,codes)
  assert.equal(rows.length,1205)
  assert.equal(new Set(rows.map(r=>r.brand_code)).size,1205)
  assert.equal(f.calls.length,7)
  assert.ok(f.calls.every(c=>c.batch.length<=200))
})
test('empty historical code list performs no inventory query',async()=>{
  const f=await fixture()
  assert.equal((await f.module.loadHistoricalInventory(f.db,[])).length,0)
  assert.equal(f.calls.length,0)
})
test('historical lookup fails explicitly on database failure',async()=>{
  const f=await fixture(true)
  await assert.rejects(f.module.loadHistoricalInventory(f.db,['1213']),/Read failure/)
})
