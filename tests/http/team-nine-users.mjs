// Nine people at the same time (SIMULACAO_EQUIPES.md): 2 admins, team A (2 counters + Independent)
// and team B (3 counters + Independent), each in an isolated browser context, through the real
// screens, from login to the final Excel. Disposable runner only; synthetic data; never a remote URL.
// VIDEO_DIR set: one video per person plus a 3x3-style grid (nine-users.mp4) for review/tutorials.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable runner required')
const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
assert.equal(new URL(status.API_URL).origin, 'http://127.0.0.1:54321')
const base = 'http://127.0.0.1:3100'
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
const checked = r => { if (r.error) throw new Error('Fixture failed: ' + r.error.message); return r.data }
const videoDir = process.env.VIDEO_DIR
const pace = () => delay(Number(process.env.VIDEO_PACE_MS ?? 0)) // readable video; everyone still acts at once

// Fixture: one warehouse, seven active products (BPU 10, pallet 5). P7 is counted by nobody.
const suffix = randomUUID().slice(0, 6)
const code = n => 'N9-' + suffix + '-P' + n
const wh = checked(await db.from('warehouses').insert({ name: 'Nine users ' + suffix }).select('id,name').single())
checked(await db.from('inventory_items').insert([1, 2, 3, 4, 5, 6, 7].map(n => ({
  brand_code: code(n), brand_name: 'Nine product ' + n, category: 'Test', category1: 'Test',
  bpu: 10, pallet_size: 5, weight_avg: 0, warehouse_id: wh.id, brand_active: true,
}))))
const session = checked(await db.from('count_sessions').insert({ warehouse_id: wh.id, title: 'Nine users ' + suffix }).select('id').single())
const admins = []
for (const n of [1, 2]) {
  const email = 'nine-admin-' + n + '-' + randomUUID() + '@example.invalid', password = randomUUID() + 'aA!9'
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Admin ' + n } })).user
  checked(await db.from('app_user_access').insert({ user_id: user.id, access_kind: 'admin' }))
  admins.push({ label: 'Admin ' + n, email, password })
}
// First person is the Independent. Counts per counter (cases, units) and the Independent's reconciled value for each difference.
const TEAMS = [
  { name: 'Team A', people: ['Alice', 'Ben', 'Carla'], counters: 2,
    counts: [{ 1: [3, 0], 2: [2, 5], 3: [4, 0], 4: [1, 1] }, { 1: [3, 0], 2: [2, 4], 3: [4, 0] }],
    reconcile: { 2: [2, 5], 4: [1, 1] } },
  { name: 'Team B', people: ['Diego', 'Elena', 'Farid', 'Grace'], counters: 3,
    counts: [{ 3: [2, 0], 5: [6, 2], 6: [1, 0] }, { 3: [2, 0], 5: [6, 2], 6: [1, 0] }, { 3: [2, 0], 5: [6, 2], 6: [1, 1] }],
    reconcile: { 6: [1, 1] } },
]
// R13: inside a team compare, across teams add. P3 is counted by both teams.
const EXPECTED = { 1: [3, 0], 2: [2, 5], 3: [6, 0], 4: [1, 1], 5: [6, 2], 6: [1, 1], 7: [0, 0] }

const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, VERCEL_ENV: 'preview', NEXT_TELEMETRY_DISABLED: '1', TEAM_SETUP_ENABLED: 'true' }
delete env.NEXT_PUBLIC_SENTRY_DSN; delete env.SENTRY_AUTH_TOKEN
if (!process.env.SKIP_BUILD) execFileSync('npm', ['run', 'build'], { env, stdio: 'inherit', timeout: 300000 })
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3100'], { env, stdio: 'pipe' })
let appLog = '' // in memory only: never publish cookies, keys or PINs
for (const s of [app.stdout, app.stderr]) s.on('data', c => { appLog = (appLog + c).slice(-20000) })
const { chromium } = await import('/tmp/count-stock-browser/node_modules/playwright/index.mjs')
const browser = await chromium.launch()
const started = Date.now(), timings = []
let stage = 'start'
const phase = async (name, work) => {
  stage = name; const t = Date.now(); await work(); timings.push([name, ((Date.now() - t) / 1000).toFixed(1)])
  console.log('PASS: ' + name)
}
const serverErrors = [], clicks = { finishConflicts: 0, accept: 0 }
const PHONE = { width: 390, height: 844 }, LAPTOP = { width: 1280, height: 800 }
async function device(label, size) {
  if (videoDir) mkdirSync(videoDir + '/raw/' + label, { recursive: true })
  const context = await browser.newContext({ viewport: size, ...(videoDir ? { recordVideo: { dir: videoDir + '/raw/' + label, size } } : {}) })
  // Name badge for the video only; aria-hidden and click-through, so no check can see or hit it.
  if (videoDir) await context.addInitScript(text => addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div'); badge.textContent = text; badge.setAttribute('aria-hidden', 'true')
    badge.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99999;pointer-events:none;background:#E4572E;color:#fff;font:600 13px system-ui;padding:3px 8px;border-radius:4px'
    document.body.appendChild(badge)
  }), label)
  const p = await context.newPage(); p.setDefaultTimeout(60000)
  p.on('response', r => { if (r.status() >= 500) serverErrors.push(label + ' ' + r.status() + ' ' + new URL(r.url()).pathname) })
  return { label, context, p }
}
const confirmInApp = async p => { await p.locator('dialog[open] [data-confirm]').click(); await p.locator('dialog[open]').waitFor({ state: 'detached' }) }
const hold = async (p, name) => {
  await p.getByRole('button', { name, exact: true }).focus(); await p.keyboard.down('Space'); await delay(4300); await p.keyboard.up('Space')
}
const cells = (p, brand) => p.locator('tr[data-brand="' + brand + '"] td').evaluateAll(tds => tds.slice(1, -1).map(td => td.textContent.trim()))
async function until(check, label) {
  for (let i = 0; i < 240; i++) { if (await check().catch(() => false)) return; await delay(250) }
  throw new Error('Timed out: ' + label)
}
const all = (list, work) => Promise.all(list.map(work))

let admin1, admin2, people = [], teams = []
try {
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) { try { ready = (await fetch(base + '/login')).ok } catch {} if (!ready) await delay(1000) }
  assert.ok(ready, 'Next server must start')
  // All nine devices open together, so the videos stay in sync.
  ;[admin1, admin2, ...people] = await Promise.all([
    device('Admin 1', LAPTOP), device('Admin 2', LAPTOP),
    ...['A Independent', 'A Counter 1', 'A Counter 2', 'B Independent', 'B Counter 1', 'B Counter 2', 'B Counter 3'].map(l => device(l, PHONE)),
  ])
  await all([...people.map(x => x.p), admin1.p, admin2.p], p => p.goto(base + '/login'))

  await phase('two admins log in at the same time', () => all([admin1, admin2], async (a, i) => {
    await a.p.getByRole('button', { name: 'Log In as Admin', exact: true }).click()
    await a.p.locator('[name="email"]').fill(admins[i].email)
    await a.p.locator('[name="password"]').fill(admins[i].password)
    await pace()
    await a.p.getByRole('button', { name: 'Log In', exact: true }).click()
    await a.p.waitForURL(base + '/admin')
  }))

  await phase('admin 1 creates 2 teams (3 + 4 people)', async () => {
    const p = admin1.p
    await p.goto(base + '/admin/sessao/' + session.id + '/equipes?n=2')
    await p.getByRole('heading', { name: 'Configure Variable Teams' }).waitFor()
    await p.locator('fieldset').nth(1).getByRole('button', { name: 'Add counter', exact: true }).click()
    for (const [t, team] of TEAMS.entries()) {
      await p.locator('[name="team_' + t + '_name"]').fill(team.name)
      for (let j = 0; j <= team.counters; j++) await p.locator('[name="team_' + t + '_member_' + j + '"]').fill(team.people[j])
    }
    await pace()
    await p.getByRole('button', { name: 'Create Teams and Generate Logins', exact: true }).click()
    await p.getByRole('heading', { name: 'Logins Generated', exact: true }).waitFor()
  })

  // PINs come from the setup result (an admin RPC), as the printed cards would.
  const reader = createClient(status.API_URL, status.ANON_KEY, options)
  checked(await reader.auth.signInWithPassword({ email: admins[0].email, password: admins[0].password }))
  const plan = checked(await reader.rpc('read_team_setup', { p_session: session.id })).plan
  for (const [t, team] of TEAMS.entries()) {
    const stored = plan.find(x => x.name === team.name)
    const id = checked(await db.from('teams').select('id').eq('session_id', session.id).eq('team_name', team.name).single()).id
    const independent = stored.members.find(m => m.role === 'independent')
    const counters = stored.members.filter(m => m.role !== 'independent')
    assert.equal(counters.length, team.counters)
    const offset = t === 0 ? 0 : 3
    teams.push({ ...team, id, pin: stored.pin, admin: t === 0 ? admin1 : admin2,
      independent: { ...people[offset], member: independent },
      counters: counters.map((m, i) => ({ ...people[offset + 1 + i], member: m, counts: team.counts[i] })) })
  }
  const everyone = teams.flatMap(t => [t.independent, ...t.counters].map(x => ({ ...x, team: t })))

  await phase('seven people log in with their PINs at the same time', () => all(everyone, async x => {
    await x.p.locator('[name="team_pin"]').fill(x.team.pin)
    await x.p.locator('[name="user_pin"]').fill(x.member.pin)
    await pace()
    await x.p.getByRole('button', { name: 'Log In', exact: true }).click()
    await x.p.waitForURL(base + '/team')
    await x.p.getByText('Hello, ' + x.member.name, { exact: true }).waitFor()
  }))

  await phase('each admin starts one team at the same time; everyone opens the team', async () => {
    await all(teams, async t => {
      await t.admin.p.goto(base + '/team/' + t.id)
      await pace()
      await t.admin.p.getByRole('button', { name: 'Start team counting', exact: true }).click()
      await t.admin.p.locator('[data-phase="counting"]').waitFor()
    })
    await all(everyone, async x => { await x.p.goto(base + '/team/' + x.team.id); await x.p.locator('[data-phase="counting"]').waitFor() })
  })

  await phase('five counters count at the same time; Independents see every count live', () => all(teams, async t => {
    const watch = all(Object.keys(Object.assign({}, ...t.counts)), async n => {
      const want = t.counts.map(c => c[n] ? c[n][0] + '+' + c[n][1] : 'Not counted')
      await until(async () => JSON.stringify(await cells(t.independent.p, code(n))) === JSON.stringify(want), t.name + ' live P' + n)
    })
    await all(t.counters, async c => {
      for (const [n, [cases, units]] of Object.entries(c.counts)) {
        await c.p.getByRole('textbox', { name: 'Find product' }).fill(code(n))
        await c.p.getByRole('button').filter({ hasText: code(n) }).click()
        const inputs = c.p.locator('input[type="number"]')
        await inputs.nth(1).fill(String(cases)); await inputs.nth(2).fill(String(units))
        await pace()
        await c.p.getByRole('button', { name: 'Confirm Count', exact: true }).click()
        await c.p.getByText(cases + ' cases · ' + units + ' units', { exact: true }).waitFor()
        await c.p.getByRole('button', { name: 'Count next product', exact: true }).click()
      }
    })
    await watch
  }))

  await phase('admin 2 sees both teams in the consolidated live view', async () => {
    await admin2.p.goto(base + '/admin/sessao/' + session.id + '/ao-vivo')
    const row = admin2.p.locator('tr', { hasText: 'Nine product 3' })
    for (const t of teams) await row.getByText(t.name, { exact: true }).first().waitFor()
    await pace()
    await admin2.p.goto(base + '/team/' + teams[1].id)
    await admin2.p.locator('[data-phase="counting"]').waitFor()
  })

  // Same-instant finishes collide on the team revision: the loser sees "The team changed" (T50,
  // recoverable) and, like a person, holds again. Collisions are counted and reported, not hidden.
  await phase('every counter holds Finish at the same time; Independents accept each one', () => all(teams, async t => {
    const waiting = /^Your count status: (Waiting for the Independent|Accepted)$/
    const accepting = (async () => { // the Independent taps Accept on whoever is waiting, while counters keep finishing
      await until(async () => {
        const accept = t.independent.p.locator('[data-member] button:not([disabled])', { hasText: /^Accept$/ }).first()
        if (await accept.count()) { await accept.click(); clicks.accept++; await pace() }
        return (await t.independent.p.locator('[data-phase="reconciling"]').count()) === 1
      }, t.name + ' all finishes accepted')
    })()
    await all(t.counters, async c => {
      for (let attempt = 0; ; attempt++) {
        assert.ok(attempt < 5, c.label + ': finish never confirmed')
        await hold(c.p, 'Hold to finish'); await confirmInApp(c.p); await delay(500)
        let done = false
        await until(async () => (done = (await c.p.getByText(waiting).count()) === 1) || (await c.p.locator('[data-phase="counting"]').count()) === 0
          || ((await c.p.getByRole('button', { name: 'Hold to finish', exact: true }).isEnabled())
            && (await c.p.getByText('The team changed. Refresh and try again.', { exact: true }).count()) === 1), c.label + ' finish result')
        if (done || (await c.p.locator('[data-phase="counting"]').count()) === 0) break
        clicks.finishConflicts++
      }
    })
    await accepting
  }))

  await phase('both Independents reconcile and submit at the same time', () => all(teams, async t => {
    const p = t.independent.p, counted = Object.keys(Object.assign({}, ...t.counts))
    await until(async () => (await p.locator('tr[data-brand]').count()) === counted.length, t.name + ' comparison rows')
    const pending = await p.locator('tr[data-result="Needs reconciliation"]').evaluateAll(rows => rows.map(r => r.dataset.brand).sort())
    assert.deepEqual(pending, Object.keys(t.reconcile).map(code).sort(), t.name + ': only real differences need reconciliation')
    for (const [n, [cases, units]] of Object.entries(t.reconcile)) {
      await p.locator('tr[data-brand="' + code(n) + '"]').getByRole('button', { name: 'Enter reconciled count', exact: true }).click()
      const inputs = p.locator('input[type="number"]')
      await inputs.nth(1).fill(String(cases)); await inputs.nth(2).fill(String(units))
      await pace()
      await p.getByRole('button', { name: 'Confirm Count', exact: true }).click()
      await p.locator('tr[data-brand="' + code(n) + '"][data-result="Reconciled ' + cases + '+' + units + '"]').waitFor()
    }
    await hold(p, 'Hold to submit to admin'); await confirmInApp(p)
    await t.admin.p.locator('[data-phase="admin_review"]').waitFor()
  }))

  await phase('both admins accept their team result at the same time', () => all(teams, async t => {
    await pace()
    await t.admin.p.getByRole('button', { name: 'Accept result', exact: true }).click(); await confirmInApp(t.admin.p)
    await t.independent.p.locator('[data-signing]').waitFor()
  }))

  await phase('five counters sign on their own phone at the same time, then the Independents', () => all(teams, async t => {
    const sign = async x => {
      const block = x.p.locator('[data-participant="' + x.member.name + '"]')
      await block.getByRole('button', { name: 'SIGN WITH PERSONAL PIN CODE', exact: true }).click()
      await block.locator('input[type="password"]').fill(x.member.pin)
      await pace()
      await block.getByRole('button', { name: 'Confirm signature', exact: true }).click()
      await x.p.locator('[data-participant="' + x.member.name + '"][data-status="Signed by PIN"]').waitFor()
    }
    await all(t.counters, async c => { await c.p.locator('[data-signing]').waitFor(); await sign(c) })
    await sign(t.independent)
    await t.independent.p.getByText('All signatures received. Waiting for the admin to close the team.', { exact: true }).waitFor()
  }))

  await phase('both admins close their team at the same time', () => all(teams, async t => {
    await pace()
    await t.admin.p.getByRole('button', { name: 'Confirm and close team', exact: true }).click(); await confirmInApp(t.admin.p)
    await t.admin.p.waitForURL(base + '/admin/sessao/' + session.id + '/equipes')
  }))

  await phase('both admins press "close the count" at the same time; it closes once', async () => {
    await all([admin1, admin2], async a => {
      await a.p.goto(base + '/admin/sessao/' + session.id + '/equipes')
      await a.p.locator('[data-closing="ready"]').waitFor()
      await a.p.locator('tr[data-uncounted="' + code(7) + '"]').waitFor()
    })
    await pace()
    await all([admin1, admin2], async a => {
      await a.p.getByRole('button', { name: 'Acknowledge and close the count', exact: true }).click(); await confirmInApp(a.p)
    })
    await all([admin1, admin2], a => a.p.locator('[data-closing="closed"]').waitFor())
    assert.equal(checked(await db.from('team_session_results').select('session_id').eq('session_id', session.id)).length, 1)
  })

  await phase('final Excel: team results added across teams, P7 not counted', async () => {
    const res = await admin1.p.request.get(base + '/api/sessao/' + session.id + '/team-export')
    assert.equal(res.status(), 200)
    const book = XLSX.read(Buffer.from(await res.body()), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(book.Sheets.Consolidado, { defval: '' })
    const got = Object.fromEntries(rows.map(r => [r['Brand Code'], [r['TOTAL Cases'], r['TOTAL Units']]]))
    for (const [n, want] of Object.entries(EXPECTED)) assert.deepEqual(got[code(n)], want, 'Total P' + n)
    assert.equal(rows.find(r => r['Brand Code'] === code(7)).Note, 'Not counted')
    // One sealed count per counter and product: nothing duplicated by the simultaneous clicks.
    for (const t of teams) {
      const records = checked(await db.from('team_count_records').select('brand_code,slot_id').eq('team_id', t.id))
      assert.equal(records.length, t.counts.reduce((s, c) => s + Object.keys(c).length, 0), t.name + ' records')
      assert.equal(new Set(records.map(r => r.brand_code + r.slot_id)).size, records.length, t.name + ' no duplicates')
      const kinds = checked(await db.from('team_confirmations').select('kind').eq('team_id', t.id)).map(r => r.kind)
      assert.deepEqual(kinds, kinds.map(() => 'pin')); assert.equal(kinds.length, t.counters.length + 1)
    }
  })

  assert.deepEqual(serverErrors, [], 'No server error on any of the nine devices')
  console.log('PASS: nine people, two teams and two admins at the same time: ' + ((Date.now() - started) / 1000).toFixed(0) + ' s')
  console.table(timings)
  // 5 counters need 5 accepts; anything above that was a collision the person had to repeat.
  console.log('FINDING: finish collisions repeated by counters: ' + clicks.finishConflicts + '; extra Accept taps by Independents: ' + (clicks.accept - 5))
} catch (error) {
  // Stage only: Playwright messages may echo typed PINs.
  console.error('Last server log lines:\n' + appLog.split('\n').filter(l => !/@count\.local|password/i.test(l)).slice(-15).join('\n'))
  if (serverErrors.length) console.error('Server errors: ' + serverErrors.join('; '))
  if (process.env.SCREENSHOT_DIR) { // synthetic screens of every device at the failure
    mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true })
    await Promise.all([admin1, admin2, ...people].filter(Boolean).map(x =>
      x.p.screenshot({ path: process.env.SCREENSHOT_DIR + '/failure-' + x.label.replace(/ /g, '-') + '.png', fullPage: true }).catch(() => {})))
  }
  throw new Error('Nine users test failed at stage: ' + stage + ' [' + error?.name + '] ' + String(error?.message ?? '').split('\n')[0].replace(/\d{4}/g, '####'))
} finally {
  // Closing the contexts writes the videos.
  await Promise.all([admin1, admin2, ...people].filter(Boolean).map(x => x.context.close()))
  await browser.close()
  app.kill('SIGTERM')
}

// Grid: two admin laptops on top, seven phones below, all on the same clock.
if (videoDir) {
  const order = ['Admin 1', 'Admin 2', 'A Independent', 'A Counter 1', 'A Counter 2', 'B Independent', 'B Counter 1', 'B Counter 2', 'B Counter 3']
  const files = order.map(l => { const d = videoDir + '/raw/' + l; return d + '/' + readdirSync(d).find(f => f.endsWith('.webm')) })
  assert.ok(files.every(existsSync), 'one video per person')
  const scale = files.map((_, i) => '[' + i + ':v]' + (i < 2 ? 'scale=960:600' : 'scale=274:593') + ',setpts=PTS-STARTPTS[v' + i + ']').join(';')
  const layout = ['0_0', '960_0', ...[0, 1, 2, 3, 4, 5, 6].map(i => i * 274 + '_600')].join('|')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    scale + ';' + order.map((_, i) => '[v' + i + ']').join('') + 'xstack=inputs=9:layout=' + layout + ':fill=black,pad=1920:1200[out]',
    '-map', '[out]', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', videoDir + '/nine-users.mp4'], { stdio: 'inherit' })
  console.log('Video: nine-users.mp4 plus one webm per person')
}
