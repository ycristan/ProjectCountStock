import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import * as XLSX from 'xlsx'
import * as yauzl from 'yauzl'
import { loadSource } from '../inventory/source-fixture.mjs'
const format = await loadSource('lib/inventory-import.ts')
const { createInventoryArchive } = await loadSource('lib/inventory-archive.ts', { xlsx: XLSX, './inventory-import': format })
const { readInventoryXlsx } = await loadSource('lib/inventory-xlsx.ts', {
  'server-only': {}, 'node:buffer': { Buffer }, xlsx: XLSX, yauzl, './inventory-import': format,
})
function unzip(bytes) {
  return new Promise((resolve,reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const files = []
      zip.on('error', reject)
      zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error)
        const chunks = []
        stream.on('data', chunk => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => { files.push({ name: entry.fileName, bytes: Buffer.concat(chunks) }); zip.readEntry() })
      }))
      zip.on('end', () => resolve(files))
      zip.readEntry()
    })
  })
}
const item = { brand_code:'006323',brand_name:'Product',category:'Drinks',category1:'Cans',bpu:1,pallet_size:0,weight_avg:0,brand_active:false,bins:['40B'] }
test('ZIP contains one independently readable, reimportable workbook per warehouse', async () => {
  const files = await unzip(createInventoryArchive([
    { id:'1',name:'Main',items:[item] },
    { id:'2',name:'Service',items:[{...item,brand_code:'service',brand_active:true}] },
  ]))
  const books = files.filter(f => f.name.endsWith('.xlsx'))
  assert.equal(books.length,2)
  const main = await readInventoryXlsx(books[0].bytes,books[0].name)
  const service = await readInventoryXlsx(books[1].bytes,books[1].name)
  assert.equal(main.ok,true); assert.equal(service.ok,true)
  assert.equal(main.warehouseName,'Main')
  assert.equal(main.items[0].brand_code,'006323')
  assert.equal(main.items[0].brand_active,false)
  assert.equal(service.warehouseName,'Service')
  assert.equal(service.items[0].brand_code,'service')
})
test('warehouse names cannot escape ZIP paths or overwrite sanitized-name collisions', async () => {
  const files = await unzip(createInventoryArchive([
    {id:'1',name:'../Main',items:[item]}, {id:'2',name:'../Main',items:[item]},
  ]))
  const names = files.filter(f=>f.name.endsWith('.xlsx')).map(f=>f.name)
  assert.equal(new Set(names).size,2)
  assert.ok(names.every(name=>!name.includes('/') && !name.includes('..')))
})
