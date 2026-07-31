# System Settings + Solo Session Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Every coding step runs under `/ponytail` (full mode, already active). Task 8 requires running `/code-review` on the full diff before the PR is considered ready — the user explicitly asked for this this round, in addition to the existing per-task spec+quality review process. Do not skip it.**

**Goal:** Give the admin a visible `System Settings` screen (tara/tolerance defaults, solo counter PIN management, notify e-mail) and replace the current "create solo session, then silently auto-save toggles" flow with an explicit multi-step wizard ending in a real "Confirm & Create Session" button — while fixing a real pre-existing bug (solo weight-count tara hardcoded to `300` with no admin control).

**Architecture:** One new migration (2 new columns on `app_settings`, 1 new column on `solo_sessions`). One new server-action file (`actions/settings.ts`) using `admin.auth.admin.createUser()`/`deleteUser()` — the same method `criarEquipes` already uses for team counters — to create/delete the fixed solo-counter account for real (no more manual SQL). `actions/solo.ts` gains one consolidated creation action and loses the now-superseded title-only one. `/admin/sessao` becomes a Team/Solo picker; the existing team form moves to `/admin/sessao/team` unchanged except two removed fields; a new `/admin/sessao/solo` wizard (4 local-state steps, nothing written to the DB until the final confirm) replaces `/admin/solo`'s inline create form.

**Tech Stack:** Same as the rest of this branch — Next.js 16/React 19/TypeScript/Supabase, no local checkout, GitHub MCP + Supabase MCP only, Vercel deploy = build verification.

**Reference spec:** `docs/superpowers/specs/2026-07-31-system-settings-and-session-wizard-design.md` (branch `docs/solo-count-fixed-counter-design`). This plan is an addendum to the already-executed plan at `docs/superpowers/plans/2026-07-30-solo-counter-fixed.md` — read that one's "Before you start" section too; the same rules apply (branch `feat/solo-counter-fixed`, PR #58, no merge without explicit approval, migrations applied by hand via Supabase MCP as you go).

---

## Before you start

- Same branch as before: `feat/solo-counter-fixed`. Same repo: `ycristan/ProjectCountStock`. Same Supabase project: `sktpzvlmeegyuqsvtunx`.
- The database currently has a real user-created test session ("Teste Email", assigned to the solo counter, restricted list) and the fixed solo-counter account (`90000001@count.local`, team_pin `9000`, user_pin `0001`) already exists — do not delete either as a side effect of any task here. Task 2's `criarContadorSoloFixo` action WILL delete-and-replace that account when the admin clicks the button in the UI later — that's expected end-user behavior, not something to trigger yourself while implementing.
- No local checkout. No `npm run build`. Verify via Vercel deployment state (`mcp__claude_ai_Vercel__list_deployments`, project id `prj_JHV6J8kOpjCw5m68QDxmSzj8FBdc`, team id `team_zLNmzkszBOvqcJ1nRXM1Azkk`) after each commit — the branch's latest commit should show `state: READY`.

---

### Task 1: Migration — settings columns + solo tare

**Files:**
- Create: `supabase/migrations/024_system_settings_and_solo_tare.sql`

- [ ] **Step 1: Write and apply the migration**

```sql
ALTER TABLE app_settings
  ADD COLUMN default_box_tare_g INT NOT NULL DEFAULT 300 CHECK (default_box_tare_g > 0),
  ADD COLUMN default_tolerance_g INT NOT NULL DEFAULT 0 CHECK (default_tolerance_g >= 0);

ALTER TABLE solo_sessions
  ADD COLUMN box_tare_g INT NOT NULL DEFAULT 300 CHECK (box_tare_g > 0);
```

Apply via `mcp__claude_ai_Supabase__apply_migration` (`project_id: sktpzvlmeegyuqsvtunx`, `name: system_settings_and_solo_tare`).

- [ ] **Step 2: Verify**

```sql
SELECT default_box_tare_g, default_tolerance_g FROM app_settings WHERE id = 1;
SELECT id, title, box_tare_g FROM solo_sessions;
```

Expected: first query returns one row with `default_box_tare_g = 300`, `default_tolerance_g = 0`. Second query returns every existing solo session (including "Teste Email") with `box_tare_g = 300` (backfilled by the column default).

- [ ] **Step 3: Commit**

`mcp__github__create_or_update_file` for the migration file on `feat/solo-counter-fixed`, message `feat: migration for system settings defaults and solo session tare`.

---

### Task 2: `actions/settings.ts` — new file

**Files:**
- Create: `actions/settings.ts`

- [ ] **Step 1: Write the file**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'admin'
}

// ─── Defaults + notify e-mail ───────────────────────────────────────────────

export async function buscarConfigSistema(): Promise<{
  default_box_tare_g: number
  default_tolerance_g: number
  notify_email: string
}> {
  if (!(await isAdmin())) return { default_box_tare_g: 300, default_tolerance_g: 0, notify_email: '' }
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('default_box_tare_g, default_tolerance_g, notify_email')
    .eq('id', 1)
    .single()
  return {
    default_box_tare_g: data?.default_box_tare_g ?? 300,
    default_tolerance_g: data?.default_tolerance_g ?? 0,
    notify_email: data?.notify_email ?? '',
  }
}

export async function salvarConfigSistema(input: {
  default_box_tare_g: number
  default_tolerance_g: number
  notify_email: string
}): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  if (!Number.isInteger(input.default_box_tare_g) || input.default_box_tare_g <= 0) {
    return { error: 'Tare must be a positive whole number.' }
  }
  if (!Number.isInteger(input.default_tolerance_g) || input.default_tolerance_g < 0) {
    return { error: 'Tolerance must be zero or a positive whole number.' }
  }
  const trimmed = input.notify_email.trim()
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: 'Invalid email address.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('app_settings')
    .update({
      default_box_tare_g: input.default_box_tare_g,
      default_tolerance_g: input.default_tolerance_g,
      notify_email: trimmed || null,
    })
    .eq('id', 1)
  return error ? { error: error.message } : {}
}

// ─── Fixed solo counter account (one at a time) ─────────────────────────────

function genPin(exclude: Set<string>): string {
  let pin: string
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000))
  } while (exclude.has(pin))
  exclude.add(pin)
  return pin
}

export async function statusContadorSoloFixo(): Promise<{ active: boolean }> {
  if (!(await isAdmin())) return { active: false }
  const admin = createAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return { active: users.some((u) => u.user_metadata?.is_solo_counter === true) }
}

export async function criarContadorSoloFixo(): Promise<{
  team_pin?: string
  user_pin?: string
  error?: string
}> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  // ponytail: only one fixed solo counter at a time — creating a new one retires the old
  const { data: { users: before } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = before.find((u) => u.user_metadata?.is_solo_counter === true)
  if (existing) {
    const { error: delError } = await admin.auth.admin.deleteUser(existing.id)
    if (delError) return { error: `Error retiring previous account: ${delError.message}` }
  }

  const { data: teams } = await admin.from('teams').select('team_pin')
  const usedTeamPins = new Set((teams ?? []).map((t) => t.team_pin))
  const { data: { users: after } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of after) {
    if (u.email?.endsWith('@count.local')) usedTeamPins.add(u.email.slice(0, 4))
  }

  const teamPin = genPin(usedTeamPins)
  const userPin = genPin(new Set())
  const email = `${teamPin}${userPin}@count.local`

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password: userPin,
    user_metadata: { role: 'counter', is_solo_counter: true },
    email_confirm: true,
  })
  if (userError || !userData.user) return { error: `Error creating account: ${userError?.message}` }

  return { team_pin: teamPin, user_pin: userPin }
}

export async function deletarContadorSoloFixo(): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = users.find((u) => u.user_metadata?.is_solo_counter === true)
  if (!existing) return {}
  const { error } = await admin.auth.admin.deleteUser(existing.id)
  return error ? { error: error.message } : {}
}
```

- [ ] **Step 2: Sanity-check (no local build)**

Confirm `admin.auth.admin.createUser`/`listUsers`/`deleteUser` are used with the exact same call shape as `actions/sessao.ts`'s `criarEquipes`/`listarEquipes`/`deletarEquipe` (fetch that file from `feat/solo-counter-fixed` and compare). Confirm `createAdminClient`/`createClient` import paths match every other action file in this repo.

- [ ] **Step 3: Commit**

`actions/settings.ts` only, message `feat: system settings actions — defaults, notify e-mail, fixed solo counter account management`.

---

### Task 3: `actions/solo.ts` + `actions/sessao.ts` — wire up settings

**Files:**
- Modify: `actions/solo.ts`
- Modify: `actions/sessao.ts`

- [ ] **Step 1: `actions/solo.ts` — remove superseded exports, add the consolidated creation action**

Fetch the current file from `feat/solo-counter-fixed` (it has `criarSoloSessao`, `_saveSoloEntry`, `lancarSoloContagem`, `encerrarSoloSessao`, the assignment/list functions, `buscarNotifyEmail`, `salvarNotifyEmail`, and the counter-facing functions — 259 lines).

Remove these three functions entirely: `criarSoloSessao`, `buscarNotifyEmail`, `salvarNotifyEmail` (all superseded — the first by `criarSoloSessaoCompleta` below, the other two by `actions/settings.ts`'s `buscarConfigSistema`/`salvarConfigSistema`).

Add this new function, placed right after `criarSoloSessao` used to be (before the `_saveSoloEntry` comment block):

```ts
export async function criarSoloSessaoCompleta(input: {
  title: string
  assignedToCounter: boolean
  restrictToList: boolean
  itemCodes: string[]
}): Promise<{ id?: string; error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const title = input.title.trim()
  if (!title) return { error: 'Title is required.' }

  const admin = createAdminClient()
  const { data: settings } = await admin.from('app_settings').select('default_box_tare_g').eq('id', 1).single()
  const box_tare_g = settings?.default_box_tare_g ?? 300

  const { data, error } = await admin
    .from('solo_sessions')
    .insert({
      title,
      assigned_to_counter: input.assignedToCounter,
      restrict_to_list: input.restrictToList,
      box_tare_g,
    })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'Error creating session.' }

  if (input.restrictToList && input.itemCodes.length > 0) {
    const { error: itemsError } = await admin
      .from('solo_session_items')
      .insert(input.itemCodes.map((brand_code) => ({ session_id: data.id, brand_code })))
    if (itemsError) return { error: `Session created but failed to save item list: ${itemsError.message}` }
  }

  return { id: data.id }
}
```

Everything else in the file (`_saveSoloEntry`, `lancarSoloContagem`, `encerrarSoloSessao`, `atribuirSoloContador`, `adicionarItemListaSolo`, `removerItemListaSolo`, `listarSoloSessoesAtribuidas`, `definirNomeContadorSolo`, `lancarSoloContagemCounter`, `finalizarSoloContagemCounter`, the `isAdmin`/`isSoloCounter` helpers, all imports) stays exactly as-is.

- [ ] **Step 2: `actions/sessao.ts` — `criarSessao` reads defaults instead of `FormData`**

Fetch the current file. Replace:

```ts
export async function criarSessao(
  _prevState: SessaoState,
  formData: FormData
): Promise<SessaoState> {
  const numEquipes = parseInt(formData.get('num_equipes') as string)
  if (!numEquipes || numEquipes < 1) return { error: 'Invalid number of teams.' }

  const box_tare_g = Math.max(1, parseInt(formData.get('box_tare_g') as string) || 300)
  const tolerance_g = Math.max(0, parseInt(formData.get('tolerance_g') as string) || 0)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('count_sessions')
    .insert({ status: 'aberta', box_tare_g, tolerance_g })
    .select('id')
    .single()

  if (error || !data) return { error: 'Error creating session.' }

  redirect(`/admin/sessao/${data.id}/equipes?n=${numEquipes}`)
}
```

with:

```ts
export async function criarSessao(
  _prevState: SessaoState,
  formData: FormData
): Promise<SessaoState> {
  const numEquipes = parseInt(formData.get('num_equipes') as string)
  if (!numEquipes || numEquipes < 1) return { error: 'Invalid number of teams.' }

  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('app_settings')
    .select('default_box_tare_g, default_tolerance_g')
    .eq('id', 1)
    .single()
  const box_tare_g = settings?.default_box_tare_g ?? 300
  const tolerance_g = settings?.default_tolerance_g ?? 0

  const { data, error } = await supabase
    .from('count_sessions')
    .insert({ status: 'aberta', box_tare_g, tolerance_g })
    .select('id')
    .single()

  if (error || !data) return { error: 'Error creating session.' }

  redirect(`/admin/sessao/${data.id}/equipes?n=${numEquipes}`)
}
```

Nothing else in the file changes.

- [ ] **Step 3: Sanity-check**

Confirm no other file still imports `criarSoloSessao`, `buscarNotifyEmail`, or `salvarNotifyEmail` from `actions/solo.ts` — search the branch for those three identifiers (`SoloCreateForm.tsx` and `NotifyEmailForm.tsx` both do; Task 7 removes those files, so this is expected to still show hits until Task 7 runs — note it, don't fix it in this task).

- [ ] **Step 4: Commit**

Both files, one commit, message `feat: wire session creation to system settings defaults; consolidate solo session creation`.

---

### Task 4: System Settings screen

**Files:**
- Create: `app/admin/settings/page.tsx`
- Create: `app/admin/settings/_components/SystemSettingsForm.tsx`
- Create: `app/admin/settings/_components/SoloCounterCard.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: `SystemSettingsForm.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { salvarConfigSistema } from '@/actions/settings'

type Props = { initial: { default_box_tare_g: number; default_tolerance_g: number; notify_email: string } }

export function SystemSettingsForm({ initial }: Props) {
  const [tare, setTare] = useState(String(initial.default_box_tare_g))
  const [tolerance, setTolerance] = useState(String(initial.default_tolerance_g))
  const [email, setEmail] = useState(initial.notify_email)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSaved(false)
    startTransition(async () => {
      const res = await salvarConfigSistema({
        default_box_tare_g: parseInt(tare) || 0,
        default_tolerance_g: parseInt(tolerance) || 0,
        notify_email: email,
      })
      if (res.error) { setErro(res.error); return }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Defaults &amp; Notifications</h3>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Tare (g)</label>
        <input
          type="number"
          min={1}
          value={tare}
          onChange={(e) => { setTare(e.target.value); setSaved(false) }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
        <p className="text-xs text-slate-400 mt-1">Used for new team and solo weight-count sessions. Sessions already open keep their own value.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Weight Tolerance (g)</label>
        <input
          type="number"
          min={0}
          value={tolerance}
          onChange={(e) => { setTolerance(e.target.value); setSaved(false) }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
        <p className="text-xs text-slate-400 mt-1">Team sessions only. Maximum difference between C1 and C2 to auto-combine.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notification e-mail (solo counter results)</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
          placeholder="admin@example.com"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-slate-900 text-white font-semibold rounded-xl px-4 py-2 text-sm disabled:opacity-40"
      >
        {isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: `SoloCounterCard.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { criarContadorSoloFixo, deletarContadorSoloFixo } from '@/actions/settings'

export function SoloCounterCard({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive)
  const [revealedPin, setRevealedPin] = useState<{ team_pin: string; user_pin: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    setErro(null)
    startTransition(async () => {
      const res = await criarContadorSoloFixo()
      if (res.error) { setErro(res.error); return }
      setRevealedPin({ team_pin: res.team_pin!, user_pin: res.user_pin! })
      setActive(true)
    })
  }

  function handleDelete() {
    setErro(null)
    startTransition(async () => {
      const res = await deletarContadorSoloFixo()
      if (res.error) { setErro(res.error); return }
      setActive(false)
      setRevealedPin(null)
      setConfirmingDelete(false)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Solo Counter</h3>

      {revealedPin ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            New credentials — write these down, they won&apos;t be shown again
          </p>
          <div className="flex gap-4 font-mono text-lg font-bold text-slate-900">
            <span>Team: {revealedPin.team_pin}</span>
            <span>PIN: {revealedPin.user_pin}</span>
          </div>
          <button onClick={() => setRevealedPin(null)} className="text-xs font-semibold text-amber-800 underline">
            I&apos;ve saved it
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {active
            ? 'Active — you can assign sessions to it.'
            : "No solo counter configured — sessions can't be assigned until you create one."}
        </p>
      )}

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}

      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 disabled:opacity-40"
        >
          {isPending ? '...' : active ? 'Create New Solo Counter' : 'Create Solo Counter'}
        </button>
        {active && !confirmingDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-sm font-semibold text-red-600 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-50"
          >
            Delete
          </button>
        )}
        {confirmingDelete && (
          <>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-sm font-semibold bg-red-600 text-white rounded-xl px-4 py-2 disabled:opacity-40"
            >
              Confirm delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-sm text-slate-500 px-4 py-2">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `app/admin/settings/page.tsx`**

```tsx
import Link from 'next/link'
import { buscarConfigSistema, statusContadorSoloFixo } from '@/actions/settings'
import { SystemSettingsForm } from './_components/SystemSettingsForm'
import { SoloCounterCard } from './_components/SoloCounterCard'

export default async function AdminSettingsPage() {
  const [config, { active }] = await Promise.all([
    buscarConfigSistema(),
    statusContadorSoloFixo(),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">System Settings</h2>
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-900">← Dashboard</Link>
      </div>
      <div className="max-w-lg space-y-6">
        <SystemSettingsForm initial={config} />
        <SoloCounterCard initialActive={active} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `app/admin/layout.tsx` — add a Settings link**

Fetch the current file. Add `import Link from 'next/link'` and insert a Settings link into the header's right-hand `<div className="flex items-center gap-4">`, before the "Hello, {name}" span:

```tsx
import { createClient } from '@/lib/supabase-server'
import { logout } from '@/actions/auth'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock — Admin</span>
        <div className="flex items-center gap-4">
          <Link href="/admin/settings" className="text-sm text-slate-300 hover:text-white">Settings</Link>
          <span className="text-sm text-slate-300">Hello, {name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-400 hover:text-white">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

All four files, one commit, message `feat: System Settings screen — defaults, solo counter PIN management, notify e-mail`.

---

### Task 5: Unified session-type picker + team creation move

**Files:**
- Modify: `app/admin/sessao/page.tsx` (becomes the picker)
- Create: `app/admin/sessao/team/page.tsx` (the old form, minus 2 fields)

- [ ] **Step 1: Replace `app/admin/sessao/page.tsx` with the picker**

```tsx
import Link from 'next/link'

export default function SessaoTypePickerPage() {
  return (
    <div>
      <Link href="/admin" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← Dashboard
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">New Session</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/sessao/team"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Team Count Session</h3>
          <p className="text-sm text-slate-500">Blind triple count with reconciliation across teams</p>
        </Link>
        <Link
          href="/admin/sessao/solo"
          className="block p-6 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm transition-all"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Solo Count Session</h3>
          <p className="text-sm text-slate-500">Count yourself or assign to the solo counter — no reconciliation</p>
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/sessao/team/page.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { criarSessao } from '@/actions/sessao'
import Link from 'next/link'

type SessaoState = { error?: string } | null

export default function SessaoTeamPage() {
  const [state, formAction, pending] = useActionState<SessaoState, FormData>(criarSessao, null)

  return (
    <div>
      <Link href="/admin/sessao" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← New Session
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">New Team Count Session</h2>
      <form action={formAction} className="space-y-6 max-w-sm">
        <div>
          <label htmlFor="num_equipes" className="block text-sm font-medium text-slate-700 mb-1">
            Number of Teams
          </label>
          <input
            id="num_equipes"
            name="num_equipes"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            required
            className="w-full px-4 py-3 text-lg border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>
        <p className="text-xs text-slate-400">
          Box tare and weight tolerance use the defaults from{' '}
          <Link href="/admin/settings" className="text-blue-600 hover:underline">System Settings</Link>.
        </p>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Creating...' : 'Create Session'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Sanity-check**

Confirm `criarSessao`'s new signature (from Task 3) still matches this form's `useActionState` usage exactly (it does — the action's public signature didn't change, only its internal box_tare_g/tolerance_g source did).

- [ ] **Step 4: Commit**

Both files, one commit, message `feat: split New Session into a Team/Solo picker; move team form to /admin/sessao/team`.

---

### Task 6: Solo session creation wizard

**Files:**
- Create: `app/admin/sessao/solo/page.tsx`
- Create: `app/admin/sessao/solo/_components/SoloSessionWizard.tsx`
- Create: `app/admin/sessao/solo/_components/SoloItemListStep.tsx`

- [ ] **Step 1: `SoloItemListStep.tsx` — local-state item picker (no DB writes)**

```tsx
'use client'

import { useState } from 'react'
import type { ItemBusca } from '@/actions/contagem'

type Item = { brand_code: string; brand_name: string }

type Props = {
  inventory: ItemBusca[]
  items: Item[]
  onChange: (items: Item[]) => void
}

export function SoloItemListStep({ inventory, items, onChange }: Props) {
  const [termo, setTermo] = useState('')
  const listedCodes = new Set(items.map((i) => i.brand_code))
  const ql = termo.trim().toLowerCase()
  const matches = ql
    ? inventory
        .filter(
          (i) =>
            !listedCodes.has(i.brand_code) &&
            (i.brand_code.toLowerCase().includes(ql) || i.brand_name.toLowerCase().includes(ql))
        )
        .slice(0, 8)
    : []

  function addItem(item: ItemBusca) {
    onChange([...items, { brand_code: item.brand_code, brand_name: item.brand_name }])
    setTermo('')
  }

  function removeItem(brandCode: string) {
    onChange(items.filter((i) => i.brand_code !== brandCode))
  }

  return (
    <div>
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Search item to add to the list..."
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
      />
      {matches.length > 0 && (
        <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
          {matches.map((item) => (
            <button
              key={item.brand_code}
              onClick={() => addItem(item)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
            >
              <span className="font-semibold">{item.brand_code}</span> — {item.brand_name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.brand_code} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs">
            {i.brand_code}
            <button onClick={() => removeItem(i.brand_code)} className="text-slate-400 hover:text-red-500">
              ✕
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-slate-400">No items added yet.</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `SoloSessionWizard.tsx` — 4-step client component**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca } from '@/actions/contagem'
import { criarSoloSessaoCompleta } from '@/actions/solo'
import { SoloItemListStep } from './SoloItemListStep'

type Step = 'title' | 'who' | 'list' | 'review'
type ListedItem = { brand_code: string; brand_name: string }

type Props = {
  inventory: ItemBusca[]
  soloCounterActive: boolean
}

export function SoloSessionWizard({ inventory, soloCounterActive }: Props) {
  const [step, setStep] = useState<Step>('title')
  const [title, setTitle] = useState('')
  const [assignedToCounter, setAssignedToCounter] = useState(false)
  const [restrictToList, setRestrictToList] = useState(false)
  const [itemCodes, setItemCodes] = useState<ListedItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    startTransition(async () => {
      const res = await criarSoloSessaoCompleta({
        title,
        assignedToCounter,
        restrictToList,
        itemCodes: itemCodes.map((i) => i.brand_code),
      })
      if (res.error) { setErro(res.error); return }
      router.push(`/admin/solo/${res.id}`)
    })
  }

  if (step === 'title') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Title</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Aisle 3 spot check"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900"
        />
        <button
          onClick={() => setStep('who')}
          disabled={!title.trim()}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    )
  }

  if (step === 'who') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Who counts</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setAssignedToCounter(false)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${!assignedToCounter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Myself
          </button>
          <button
            onClick={() => soloCounterActive && setAssignedToCounter(true)}
            disabled={!soloCounterActive}
            title={soloCounterActive ? undefined : 'No solo counter configured — set one up in System Settings'}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 disabled:opacity-40 disabled:cursor-not-allowed ${assignedToCounter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Solo counter
          </button>
        </div>
        {!soloCounterActive && (
          <p className="text-xs text-amber-600">
            No solo counter configured yet. <a href="/admin/settings" className="underline">Set one up in System Settings</a> or continue counting yourself.
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={() => setStep('title')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
          <button onClick={() => setStep('list')} className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm">Next →</button>
        </div>
      </div>
    )
  }

  if (step === 'list') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Item list</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setRestrictToList(false)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${!restrictToList ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Free add
          </button>
          <button
            onClick={() => setRestrictToList(true)}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 ${restrictToList ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}
          >
            Restricted list
          </button>
        </div>
        {restrictToList && <SoloItemListStep inventory={inventory} items={itemCodes} onChange={setItemCodes} />}
        <div className="flex gap-2">
          <button onClick={() => setStep('who')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
          <button
            onClick={() => setStep('review')}
            disabled={restrictToList && itemCodes.length === 0}
            className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">Review &amp; Confirm</h3>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-slate-500">Title</dt><dd className="font-semibold text-slate-900">{title}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Who counts</dt><dd className="font-semibold text-slate-900">{assignedToCounter ? 'Solo counter' : 'Myself'}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Item list</dt><dd className="font-semibold text-slate-900">{restrictToList ? `Restricted (${itemCodes.length} items)` : 'Free add'}</dd></div>
      </dl>
      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
      <div className="flex gap-2">
        <button onClick={() => setStep('list')} className="px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-500">← Back</button>
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="flex-1 bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          {isPending ? 'Creating...' : 'Confirm & Create Session'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `app/admin/sessao/solo/page.tsx`**

```tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { statusContadorSoloFixo } from '@/actions/settings'
import { SoloSessionWizard } from './_components/SoloSessionWizard'

export default async function SessaoSoloPage() {
  const admin = createAdminClient()
  const [inventoryRaw, { active }] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
          .eq('brand_active', true)
          .order('brand_code')
          .range(from, to)
    ),
    statusContadorSoloFixo(),
  ])

  const inventory: ItemBusca[] = inventoryRaw.map((i) => ({
    brand_code: i.brand_code,
    brand_name: i.brand_name,
    bpu: i.bpu,
    pallet_size: i.pallet_size,
    weight_avg: i.weight_avg ?? 0,
    box_tare_g: 300,
    bins: [],
    jaContado: false,
    entryExistente: null,
  }))

  return (
    <div>
      <Link href="/admin/sessao" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-4">
        ← New Session
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">New Solo Count Session</h2>
      <div className="max-w-md">
        <SoloSessionWizard inventory={inventory} soloCounterActive={active} />
      </div>
    </div>
  )
}
```

(`box_tare_g: 300` here is an unused filler — this `ItemBusca[]` only feeds the item-search picker, which never reads `box_tare_g`; the real value gets set server-side from `app_settings` inside `criarSoloSessaoCompleta` when the wizard confirms.)

- [ ] **Step 4: Sanity-check**

Confirm `ItemBusca` (from `actions/contagem.ts`) field list still matches what this page constructs — same 9 fields used throughout this branch's other solo pages. Confirm `criarSoloSessaoCompleta`'s parameter shape (from Task 3) matches exactly what `handleConfirm` sends.

- [ ] **Step 5: Commit**

All three files, one commit, message `feat: solo session creation wizard (title → who counts → item list → confirm)`.

---

### Task 7: Clean up `/admin/solo`, delete dead files, fix hardcoded tare

**Files:**
- Modify: `app/admin/solo/page.tsx`
- Delete: `app/admin/solo/_components/SoloCreateForm.tsx`
- Delete: `app/admin/solo/_components/NotifyEmailForm.tsx`
- Modify: `app/admin/solo/[id]/page.tsx`
- Modify: `app/solo/[id]/page.tsx`

- [ ] **Step 1: Replace `app/admin/solo/page.tsx`**

```tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'

export default async function AdminSoloPage() {
  const admin = createAdminClient()
  const { data: sessions } = await admin
    .from('solo_sessions')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Solo Count</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/sessao/solo"
            className="text-sm font-semibold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50"
          >
            + New Solo Count
          </Link>
          <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-900">← Dashboard</Link>
        </div>
      </div>

      <div className="space-y-3">
        {(sessions ?? []).map((s) => (
          <div
            key={s.id}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div>
              <div className="font-semibold text-slate-900">{s.title}</div>
              <div className="text-xs text-slate-400 mt-1">
                {new Date(s.created_at).toLocaleDateString('en-GB')}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.status}
              </span>
              <Link
                href={`/admin/solo/${s.id}`}
                className="text-xs font-semibold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50"
              >
                {s.status === 'open' ? 'Count →' : 'View →'}
              </Link>
            </div>
          </div>
        ))}
        {!(sessions ?? []).length && (
          <p className="text-sm text-slate-400 text-center py-8">No solo counts yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the two now-dead files**

`app/admin/solo/_components/SoloCreateForm.tsx` (called the now-removed `criarSoloSessao`) and `app/admin/solo/_components/NotifyEmailForm.tsx` (called the now-removed `buscarNotifyEmail`/`salvarNotifyEmail`) via `mcp__github__` — there's no dedicated delete-file MCP tool, so use `create_or_update_file` is not applicable either; check whether `mcp__github__push_files` supports deletions, and if not, note in the commit message that these files are orphaned (unused, unimported after Step 1) rather than physically deleted, same as `components/NextChainMark.tsx` was left orphaned in an earlier unrelated PR (#53) for the same MCP-tooling reason. Try deletion first; only fall back to "orphaned, unimported" if no delete capability exists.

- [ ] **Step 3: Fix hardcoded `box_tare_g` in `app/admin/solo/[id]/page.tsx`**

Fetch the current file. Two changes: add `box_tare_g` to the `solo_sessions` select list, and use `session.box_tare_g` instead of the literal `300` in the `items` map.

```tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCountClient } from './_components/SoloCountClient'

export default async function AdminSoloDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const [{ data: session }, inventory, entries, listItemsRaw] = await Promise.all([
    admin
      .from('solo_sessions')
      .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name, box_tare_g')
      .eq('id', id)
      .single(),
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
          .eq('brand_active', true)
          .order('brand_code')
          .range(from, to)
    ),
    fetchAllRows<{
      brand_code: string
      brand_name: string
      pallets: number
      cases: number
      units: number
      final_cases: number
      final_units: number
    }>((from, to) =>
      admin
        .from('solo_entries')
        .select('brand_code, brand_name, pallets, cases, units, final_cases, final_units')
        .eq('session_id', id)
        .range(from, to)
    ),
    fetchAllRows<{ brand_code: string }>((from, to) =>
      admin.from('solo_session_items').select('brand_code').eq('session_id', id).range(from, to)
    ),
  ])

  if (!session) notFound()

  const entryMap = Object.fromEntries(entries.map((e) => [e.brand_code, e]))
  const nameByCode = Object.fromEntries(inventory.map((i) => [i.brand_code, i.brand_name]))
  const listItems = listItemsRaw.map((li) => ({ brand_code: li.brand_code, brand_name: nameByCode[li.brand_code] ?? '' }))

  const items: ItemBusca[] = inventory.map((i) => {
    const e = entryMap[i.brand_code]
    return {
      brand_code: i.brand_code,
      brand_name: i.brand_name,
      bpu: i.bpu,
      pallet_size: i.pallet_size,
      weight_avg: i.weight_avg ?? 0,
      box_tare_g: session.box_tare_g,
      bins: [],
      jaContado: !!e,
      entryExistente: e ? { pallets: e.pallets, cases: e.cases, units: e.units } : null,
    }
  })

  return (
    <SoloCountClient
      sessionId={id}
      title={session.title}
      status={session.status}
      items={items}
      entries={entries.map((e) => ({
        brand_code: e.brand_code,
        brand_name: e.brand_name,
        final_cases: e.final_cases,
        final_units: e.final_units,
      }))}
      assignedToCounter={session.assigned_to_counter}
      restrictToList={session.restrict_to_list}
      counterName={session.counter_name}
      listItems={listItems}
    />
  )
}
```

- [ ] **Step 4: Same fix in `app/solo/[id]/page.tsx`**

Fetch the current file. Same two changes: add `box_tare_g` to the select, use `session.box_tare_g` in the map.

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import type { ItemBusca } from '@/actions/contagem'
import { SoloCounterClient } from './_components/SoloCounterClient'

export default async function SoloCounterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'counter' || user.user_metadata?.is_solo_counter !== true) {
    notFound()
  }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name, box_tare_g')
    .eq('id', id)
    .single()

  if (!session || !session.assigned_to_counter || session.status !== 'open') notFound()

  const [inventory, entries, listItems] = await Promise.all([
    fetchAllRows<{ brand_code: string; brand_name: string; bpu: number; pallet_size: number; weight_avg: number | null }>(
      (from, to) =>
        admin
          .from('inventory_items')
          .select('brand_code, brand_name, bpu, pallet_size, weight_avg')
          .eq('brand_active', true)
          .order('brand_code')
          .range(from, to)
    ),
    fetchAllRows<{ brand_code: string; pallets: number; cases: number; units: number }>((from, to) =>
      admin.from('solo_entries').select('brand_code, pallets, cases, units').eq('session_id', id).range(from, to)
    ),
    session.restrict_to_list
      ? fetchAllRows<{ brand_code: string }>((from, to) =>
          admin.from('solo_session_items').select('brand_code').eq('session_id', id).range(from, to)
        )
      : Promise.resolve([] as { brand_code: string }[]),
  ])

  const allowedCodes = session.restrict_to_list ? new Set(listItems.map((i) => i.brand_code)) : null
  const entryMap = Object.fromEntries(entries.map((e) => [e.brand_code, e]))

  const items: ItemBusca[] = inventory
    .filter((i) => !allowedCodes || allowedCodes.has(i.brand_code))
    .map((i) => {
      const e = entryMap[i.brand_code]
      return {
        brand_code: i.brand_code,
        brand_name: i.brand_name,
        bpu: i.bpu,
        pallet_size: i.pallet_size,
        weight_avg: i.weight_avg ?? 0,
        box_tare_g: session.box_tare_g,
        bins: [],
        jaContado: !!e,
        entryExistente: e ? { pallets: e.pallets, cases: e.cases, units: e.units } : null,
      }
    })

  return <SoloCounterClient sessionId={id} title={session.title} counterName={session.counter_name} items={items} />
}
```

- [ ] **Step 5: Commit**

All five changes (2 modified pages + 2 deleted/orphaned files + confirm no remaining import of the deleted components anywhere), one commit, message `fix: use per-session tare instead of hardcoded 300; remove superseded solo-create form and notify-email form (moved to wizard/settings)`.

---

### Task 8: End-to-end verification, `/code-review`, PR update

- [ ] **Step 1: Vercel build check**

`mcp__claude_ai_Vercel__list_deployments` (project `prj_JHV6J8kOpjCw5m68QDxmSzj8FBdc`, team `team_zLNmzkszBOvqcJ1nRXM1Azkk`) — confirm the deployment for the branch's latest commit shows `state: READY`. If any commit along the way shows `ERROR`, check `mcp__claude_ai_Vercel__get_deployment_build_logs` and fix before proceeding.

- [ ] **Step 2: Live DB checks (mirrors the RLS-verification style already used on this branch)**

```sql
-- confirm the picker/wizard's data model holds up
SELECT id, title, box_tare_g, assigned_to_counter, restrict_to_list FROM solo_sessions ORDER BY created_at DESC LIMIT 5;
SELECT default_box_tare_g, default_tolerance_g, notify_email FROM app_settings WHERE id = 1;
```

Confirm every solo session (including ones from before this migration) has a non-null `box_tare_g`.

- [ ] **Step 3: Manual walkthrough on the Vercel preview** (same login-credential caveat as before — this step needs the user; describe it, don't attempt it via browser automation)

1. `/admin/settings` — change the default tare, save, reload, confirm it persisted.
2. `/admin/settings` — click "Create Solo Counter" (or "Create New" if one already exists), confirm a PIN pair is revealed once, confirm the status line flips to "Active" after dismissing it.
3. `/admin/sessao` — confirm it now shows the Team/Solo picker, not a form.
4. `/admin/sessao/solo` — walk all 4 steps (title → who counts → restricted list with 2+ items → review) and confirm the "Solo counter" option is only clickable when Settings reports one active. Confirm "Confirm & Create Session" lands on `/admin/solo/[id]` with everything already configured (no more toggling needed).
5. Log in as the new solo counter PIN, count a weight-based item (if any exist in inventory with `weight_avg > 0`), confirm the tare used matches the current System Settings default (not hardcoded 300).
6. `/admin/sessao/team` — confirm the tara/tolerance fields are gone and a new team session's `count_sessions.box_tare_g` matches the current Settings default (spot check via `execute_sql`).

- [ ] **Step 4: `/code-review` on the full branch diff**

The user explicitly asked for this. Run it against `feat/solo-counter-fixed` vs `main` (the whole branch, not just this task's diff — both rounds of work). Fix anything it flags before moving on.

- [ ] **Step 5: Update the PR #58 description**

Add a section summarising this round's changes (System Settings screen, session creation wizard, the tare bug fix) and update the manual-QA checklist to include the new steps from Step 3 above. Do not merge — still requires explicit approval, and the user already said "PR #58 não aprovada" this round.
