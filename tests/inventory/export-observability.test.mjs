import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSource } from './source-fixture.mjs'

async function setup({ authorized = true, failure, warehouseError, oversize = false } = {}) {
  const events = []
  const db = { from() { return { select() { return this }, order() { return Promise.resolve({ data: [{id: 'main', name: 'Main'}], error: warehouseError }) } } } }
  let calls = 0
  const route = await loadSource('app/api/admin/inventario/route.ts', {
    '@/lib/authorization': { isAdmin: async () => authorized },
    '@/lib/supabase-server': { createClient: async () => { calls++; return db } },
    '@/lib/fetch-all-rows': { fetchAllRows: async () => { if (failure) throw new Error(failure); return [] } },
    '@/lib/inventory-archive': { createInventoryArchive: () => new Uint8Array(oversize ? 4*1024*1024+1 : [80,75,3,4]) },
    '@/lib/report-inventory-export-error': { reportInventoryExportError: async reason => { events.push(reason); return 'a'.repeat(32) } },
  }, { Response, Uint8Array })
  return { route, events, calls: () => calls }
}
test('unauthorized export does not read database or emit incident', async () => {
  const f = await setup({authorized:false}); assert.equal((await f.route.GET()).status,403)
  assert.equal(f.calls(),0); assert.equal(f.events.length,0)
})
for (const failure of [
  'column inventory_items.warehouse_id does not exist',
  "Could not find the table 'public.warehouses' in the schema cache",
]) test('missing schema returns actionable 503 and captures incident: ' + failure, async () => {
  const f=await setup({failure}); const r=await f.route.GET(); const body=await r.json()
  assert.equal(r.status,503); assert.match(body.error,/database update/)
  assert.equal(body.eventId,'a'.repeat(32)); assert.deepEqual(f.events,['schema_unavailable'])
  assert.equal(r.headers.get('cache-control'),'private, no-store')
})
test('warehouse query returned error is captured, not silently returned',async()=>{
  const f=await setup({warehouseError:{message:"Could not find the table 'public.warehouses' in the schema cache"}})
  assert.equal((await f.route.GET()).status,503); assert.deepEqual(f.events,['schema_unavailable'])
})
test('unexpected error returns safe 500 with correlation id, no database details',async()=>{
  const f=await setup({failure:'secret inventory content'})
  const r=await f.route.GET(); assert.equal(r.status,500)
  assert.doesNotMatch(JSON.stringify(await r.json()),/secret inventory/); assert.deepEqual(f.events,['export_failed'])
})
test('valid export returns ZIP and emits no failure',async()=>{
  const f=await setup(); const r=await f.route.GET()
  assert.equal(r.status,200); assert.equal(r.headers.get('content-type'),'application/zip'); assert.equal(f.events.length,0)
})
test('size limit remains an explicit 413 without silently truncating products',async()=>{
  const f=await setup({oversize:true}); assert.equal((await f.route.GET()).status,413)
})
async function reporter({configured=true,flush=true,throws=false}={}) {
  const events=[],logs=[]
  const mod=await loadSource('lib/report-inventory-export-error.ts',{
    '@sentry/nextjs': {
      getClient:()=>configured?{getOptions:()=>({dsn:'synthetic'})}:undefined,
      withScope:fn=>fn({clear:()=>{},setTag:()=>{}}),
      captureException:error=>{events.push(error.message);return 'b'.repeat(32)},
      flush:async timeout=>{assert.equal(timeout,2000);if(throws)throw new Error('transport private');return flush},
    },
  },{console:{error:(...args)=>logs.push(args)}})
  return {mod,events,logs}
}
test('failure sends sanitized event and flushes before response',async()=>{
  const f=await reporter();assert.equal(await f.mod.reportInventoryExportError('schema_unavailable'),'b'.repeat(32))
  assert.deepEqual(f.events,['Inventory ZIP export failed: schema_unavailable']);assert.equal(f.logs[0][1].monitoring,'flushed')
})
test('missing Sentry configuration is visible in fallback logs, not claimed delivered',async()=>{
  const f=await reporter({configured:false});assert.equal(await f.mod.reportInventoryExportError('export_failed'),undefined)
  assert.equal(f.events.length,0);assert.equal(f.logs[0][1].monitoring,'unavailable')
})
test('Sentry flush timeout does not break error response',async()=>{
  const f=await reporter({flush:false});await f.mod.reportInventoryExportError('export_failed')
  assert.equal(f.logs[0][1].monitoring,'flush_incomplete')
})
test('Sentry transport failure does not leak its exception or break response',async()=>{
  const f=await reporter({throws:true});await f.mod.reportInventoryExportError('export_failed')
  assert.equal(f.logs[0][1].monitoring,'transport_failed');assert.doesNotMatch(JSON.stringify(f.logs),/transport private/)
})
test('Next build uses Sentry integration and retains upload body limit',async()=>{
  let called=false
  await loadSource('next.config.ts',{'@sentry/nextjs':{withSentryConfig:(config,options)=>{
    called=true;assert.equal(config.experimental.serverActions.bodySizeLimit,'4.4mb')
    assert.equal(options.sourcemaps.disable,true);return config
  }}})
  assert.equal(called,true)
})
