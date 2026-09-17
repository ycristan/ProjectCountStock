import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'

// Execute the repository's actual functions. Only external dependencies are replaced.
// No process, fetch, SDK, environment credentials or unrestricted imports are exposed.
export async function loadSource(path, mocks = {}) {
  const context = createContext({ console })
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context, identifier: path })
  await module.link((specifier) => {
    if (!Object.hasOwn(mocks, specifier)) throw new Error('Unmocked import: ' + specifier)
    const values = mocks[specifier]
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

export async function fixture(options = {}) {
  const writes = []
  const item = { warehouse_id: 'warehouse-main', brand_code: '6323', brand_name: 'Test product', bpu: 20, pallet_size: 0, ...options.item }
  const session = { warehouse_id: 'warehouse-main', id: 'session-test', status: 'open', assigned_to_counter: true,
    restrict_to_list: true, counter_name: 'Test counter', ...options.session }
  const tables = {
    inventory_items: [item],
    solo_sessions: options.missingSession ? [] : [session],
    solo_entries: options.started === false ? [] : [{ session_id: session.id, brand_code: 'existing', cases: 1 }],
    solo_session_items: options.allowed === false ? [] : [{ session_id: session.id, brand_code: item.brand_code }],
    item_bin_locations: [],
  }
  const conversion = await loadSource('lib/convert.ts')
  const db = {
    from(table) {
      if (!Object.hasOwn(tables, table)) throw new Error('Unmodelled table: ' + table)
      const filters = []
      let operation = 'select', payload, rowLimit = Infinity
      const query = {
        select() { return query },
        limit(value) { rowLimit = value; return query },
        eq(key, value) { filters.push(row => row[key] === value); return query },
        is(key, value) { return query.eq(key, value) },
        update(value) { operation = 'update'; payload = value; return query },
        upsert(value) { operation = 'upsert'; payload = value; return query },
        insert(value) { operation = 'insert'; payload = value; return query },
        delete() { operation = 'delete'; return query },
        single() { return execute(true) },
        maybeSingle() { return execute(true) },
        then(resolve, reject) { return execute(false).then(resolve, reject) },
      }
      async function execute(single) {
        if (operation === 'select' && options.readErrorTable === table) return { data: null, error: { message: 'Synthetic read failure' } }
        const rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, rowLimit)
        if (operation !== 'select') writes.push({ table, operation, payload })
        return { data: single ? rows[0] ?? null : rows, error: null }
      }
      return query
    },
    async rpc(name, args) {
      if (name !== 'convert_count') throw new Error('Unmodelled RPC: ' + name)
      const result = conversion.convertCount(args.p_pallets, args.p_cases, args.p_units, args.p_bpu, args.p_pallet_size)
      return { data: { final_cases: result.finalCases, final_units: result.finalUnits }, error: null }
    },
  }
  const mocks = {
    '@/lib/supabase-admin': { createAdminClient: () => db },
    '@/lib/supabase-server': { createClient: async () => db },
    '@/lib/authorization': { isAdmin: async () => options.admin !== false, isSoloCounter: async () => options.counter !== false },
    '@/lib/send-solo-results-email': { sendSoloResultsEmail: async () => { throw new Error('Email is forbidden in this suite') } },
    '@/actions/settings': { getDefaultTare: async () => ({ box_tare_g: 300 }) },
    '@/lib/fetch-all-rows': { fetchAllRows: async () => { throw new Error('Unmodelled pagination') } },
  }
  return {
    writes, item, session,
    solo: await loadSource('actions/solo.ts', mocks),
    inventory: await loadSource('actions/inventario.ts', mocks),
  }
}
