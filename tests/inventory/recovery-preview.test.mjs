import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadSource } from './source-fixture.mjs'

test('recovery projection scopes warehouses, inactivates source and never mutates input', async () => {
  const { projectWarehouseRecovery } = await loadSource('lib/warehouse-recovery-preview.ts')
  const items = [
    {brand_code:'1213', brand_name:'Kinder old', warehouse_id:'source', brand_active:true, bpu:24, bins:['40B']},
    {brand_code:'9888', brand_name:'Kinder active', warehouse_id:'target', brand_active:true, bpu:24, bins:['40B']},
    {brand_code:'other', brand_name:'Kinder Service', warehouse_id:'other', brand_active:true},
  ]
  const before = JSON.stringify(items)
  const result = projectWarehouseRecovery(items,'source','target')
  assert.equal(result.length,2)
  assert.equal(result[0].brand_active,false)
  assert.equal(result[0].warehouse_id,'target')
  assert.equal(result[0].bpu,24)
  assert.equal(result[1].brand_active,true)
  assert.equal(JSON.stringify(items),before)
  assert.throws(() => projectWarehouseRecovery(items,'source','source'))
})
test('same search function finds active and inactive by name, code and BIN', async () => {
  const { filterItems } = await loadSource('lib/inventory-search.ts')
  const items = [
    {brand_code:'1213',brand_name:'Kinder old',brand_active:false,bins:['40B']},
    {brand_code:'9888',brand_name:'Kinder active',brand_active:true,bins:['40B']},
    {brand_code:'1234',brand_name:'Other',brand_active:true,bins:[]},
  ]
  assert.equal(filterItems(items,' KiNdEr ').length,2)
  assert.equal(filterItems(items,'1213')[0].brand_active,false)
  assert.equal(filterItems(items,'40B').length,2)
  assert.equal(filterItems(items,'12').length,2)
  assert.equal(filterItems(items,'').length,0)
})
test('empty historical warehouse is omitted only in session options; inactive inventory qualifies', async () => {
  let joined = false, reads = 0
  const db = {from(table) {
    assert.equal(table,'warehouses')
    const q = {
      select(fields) {joined=fields.includes('!inner');return q},
      limit(n,opts) {assert.equal(n,1);assert.equal(opts.referencedTable,'inventory_items');return q},
      order() {return q},
      range() {reads++;return Promise.resolve({data:joined?[{id:'inactive',name:'Inactive only'}]:[{id:'empty',name:'Historical'},{id:'inactive',name:'Inactive only'}],error:null})}
    }
    return q
  }}
  const pagination = await loadSource('lib/fetch-all-rows.ts')
  const mocks = {
    'server-only':{},
    '@/lib/supabase-server':{createClient:async()=>db},
    '@/lib/authorization':{isAdmin:async()=>true},
    '@/lib/fetch-all-rows':{fetchAllRows:pagination.fetchAllRows},
  }
  const {listWarehouses}=await loadSource('lib/warehouse-access.ts',mocks)
  assert.equal((await listWarehouses()).length,2)
  assert.equal((await listWarehouses(true)).length,1)
  assert.equal(reads,2)
  const denied=await loadSource('lib/warehouse-access.ts',{...mocks,'@/lib/authorization':{isAdmin:async()=>false}})
  assert.equal((await denied.listWarehouses(true)).length,0)
  assert.equal(reads,2)
})
test('preview is admin-only, preview-only and does not mount count or write components', async () => {
  const page = await readFile('app/admin/inventario/recovery-preview/page.tsx','utf8')
  const client = await readFile('app/admin/inventario/recovery-preview/RecoverySearch.tsx','utf8')
  assert.match(page,/process.env.VERCEL_ENV !== 'preview' \|\| !\(await isAdmin\(\)\)/)
  assert.doesNotMatch(page+'\n'+client,/\.(insert|update|delete|upsert|rpc)\(/)
  assert.doesNotMatch(client,/CountForm|SoloCountClient|lancarSoloContagem/)
  assert.match(client,/filterItems/)
})
