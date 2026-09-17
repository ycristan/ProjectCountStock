import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import { loadSource } from './source-fixture.mjs'

async function fixture(options = {}) {
  const calls = []
  const input = new Map([
    ['file', { size: 10, name: 'inventory.xlsx', arrayBuffer: async () => Buffer.from('test') }],
    ['choices', '[]'],
    ['confirmedWarehouse', 'Main'],
  ])
  const module = await loadSource('actions/inventory-upload.ts', {
    'node:buffer': { Buffer }, 'node:process': { env: { VERCEL_ENV: options.preview ? 'preview' : 'production' } },
    '@/lib/authorization': { isAdmin: async () => options.admin !== false },
    '@/lib/supabase-server': { createClient: async () => ({ rpc: async (name, args) => {
      calls.push({ name, args }); return { data: { imported: 1, deactivated: 2 }, error: options.dbError ? { message: 'Synthetic transaction rejected' } : null }
    } }) },
    '@/lib/inventory-xlsx': {
      INVENTORY_FILE_LIMITS: { bytes: 4194304, rows: 50000 },
      InventoryFileError: Error,
      readInventoryXlsx: async (bytes, name, choices) => {
        calls.push({ reader: true, choices })
        return options.invalid ? { ok: false, issues: [{ row: 2, message: 'BPU missing' }], duplicates: [] } :
          { ok: true, warehouseName: 'Main', items: [{ sourceRow: 2, brand_code: '006323', brand_active: false, bpu: 1 }] }
      },
    },
    'next/cache': { revalidatePath: path => calls.push({ revalidate: path }) },
  })
  return { module, calls, input }
}
test('unauthorized review never reads file or reaches database', async () => {
  const f = await fixture({ admin: false })
  assert.equal((await f.module.reviewInventoryUpload(f.input)).error, 'Unauthorized')
  assert.equal(f.calls.length, 0)
})
test('review returns destination and status counts without database mutation', async () => {
  const f = await fixture()
  const result = await f.module.reviewInventoryUpload(f.input)
  assert.equal(result.review.warehouseName, 'Main')
  assert.equal(result.review.inactive, 1)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
test('invalid rows cannot reach transaction', async () => {
  const f = await fixture({ invalid: true })
  assert.equal((await f.module.confirmInventoryUpload(f.input)).issues.length, 1)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
test('forged duplicate selection shape rejected before parsing', async () => {
  const f = await fixture()
  f.input.set('choices', '[{"brandCode":"a","row":"2"}]')
  assert.match((await f.module.reviewInventoryUpload(f.input)).error, /Invalid duplicate/)
  assert.equal(f.calls.length, 0)
})
test('confirmation must match actual workbook warehouse', async () => {
  const f = await fixture()
  f.input.set('confirmedWarehouse', 'Service')
  assert.match((await f.module.confirmInventoryUpload(f.input)).error, /Review and confirm/)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
test('Preview confirmation never touches production database', async () => {
  const f = await fixture({ preview: true })
  assert.match((await f.module.confirmInventoryUpload(f.input)).error, /read-only/)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
test('confirmed import re-parses file and performs one transaction', async () => {
  const f = await fixture()
  f.input.set('createWarehouse', 'true')
  await f.module.reviewInventoryUpload(f.input)
  const result = await f.module.confirmInventoryUpload(f.input)
  assert.equal(f.calls.filter(c => c.reader).length, 2)
  const writes = f.calls.filter(c => c.name)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].name, 'import_warehouse_inventory')
  assert.equal(writes[0].args.p_create_warehouse, true)
  assert.equal(writes[0].args.p_items[0].sourceRow, undefined)
  assert.equal(result.success.deactivated, 2)
})
test('warehouse creation is never silently authorized', async () => {
  const f = await fixture()
  await f.module.confirmInventoryUpload(f.input)
  assert.equal(f.calls.find(c => c.name).args.p_create_warehouse, false)
})
test('transaction error reports failure, never success', async () => {
  const f = await fixture({ dbError: true })
  const result = await f.module.confirmInventoryUpload(f.input)
  assert.match(result.error, /transaction rejected/)
  assert.equal(result.success, undefined)
  assert.equal(f.calls.filter(c => c.revalidate).length, 0)
})
test('empty and oversized files are rejected before parsing', async () => {
  for (const size of [0, 4194305]) {
    const f = await fixture()
    f.input.set('file', { size })
    assert.match((await f.module.reviewInventoryUpload(f.input)).error, /4 MiB/)
    assert.equal(f.calls.length, 0)
  }
})
