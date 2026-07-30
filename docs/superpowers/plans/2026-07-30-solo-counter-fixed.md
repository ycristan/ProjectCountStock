# Solo Count — Contador Fixo, Lista Pré-Selecionada e E-mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Every coding step in this plan runs under `/ponytail` (full mode, already active for this project). Task 9 requires running `/ponytail-review` before the PR is opened — do not skip it.**

**Goal:** Let the admin assign a Solo Count session to a fixed, shared "solo counter" account, optionally restricted to a pre-selected item list, and e-mail the results table to the admin when that counter finalises.

**Architecture:** Reuses the existing 2-PIN Supabase Auth pattern (one new permanent `role:'counter', is_solo_counter:true` account, login via the existing `/login` page) instead of building new PIN/cookie infrastructure. Reuses `BuscaClient`/`CountForm` unchanged — list restriction is enforced by filtering which items the counter-facing page passes to `BuscaClient`, not by touching the component. Adds one migration (`assigned_to_counter`, `restrict_to_list` on `solo_sessions`; `solo_session_items`; `app_settings`), a small set of new server actions in `actions/solo.ts`, two new route trees (`/solo/*` for the counter, additions to `/admin/solo/*` for the admin), and a Resend-based e-mail helper.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase (Postgres + Auth + RLS), `resend` (new dependency), Vercel.

**Reference spec:** `docs/superpowers/specs/2026-07-30-solo-count-fixed-counter-design.md` (branch `docs/solo-count-fixed-counter-design`).

---

## Before you start

- Repo: `ycristan/ProjectCountStock` (public, GitHub). All code changes go through the GitHub MCP tools (`mcp__github__*`) — this project is developed 100% via the GitHub remote, never local `git`.
- Create the work on a new branch off `main`: `feat/solo-counter-fixed`. Never commit to `main` directly.
- Migrations are applied by hand via the Supabase MCP (`mcp__claude_ai_Supabase__apply_migration` / `execute_sql`), project id `sktpzvlmeegyuqsvtunx` — a merged PR does **not** run them automatically. Preview and production share the same database, so apply as you go (see Task 1), not only after merge.
- Do not merge to `main` without the user's explicit go-ahead in that session (2 prior incidents of unauthorised merges on this project).

---

### Task 1: Migration — schema + RLS

**Files:**
- Create: `supabase/migrations/022_solo_counter_fixed.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 022_solo_counter_fixed.sql

ALTER TABLE solo_sessions
  ADD COLUMN assigned_to_counter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN restrict_to_list BOOLEAN NOT NULL DEFAULT false;
-- counter_name (added in 018_solo_pin, always NULL until now) is reused:
-- from this point on it is set by the counter themself, not by the admin.

CREATE TABLE solo_session_items (
  session_id UUID NOT NULL REFERENCES solo_sessions(id) ON DELETE CASCADE,
  brand_code TEXT NOT NULL REFERENCES inventory_items(brand_code),
  PRIMARY KEY (session_id, brand_code)
);

ALTER TABLE solo_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY solo_session_items_admin ON solo_session_items
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY solo_session_items_counter_read ON solo_session_items
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_session_items.session_id AND s.assigned_to_counter = true
    )
  );

-- solo_sessions/solo_entries already have an admin-only ALL policy (016_solo_sessions).
-- Add read/write for the fixed solo-counter role, scoped to sessions assigned to it.
CREATE POLICY solo_sessions_counter_select ON solo_sessions
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  );

CREATE POLICY solo_sessions_counter_update ON solo_sessions
  FOR UPDATE USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  );

CREATE POLICY solo_entries_counter ON solo_entries
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_entries.session_id AND s.assigned_to_counter = true
    )
  );

CREATE TABLE app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  notify_email TEXT
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_admin ON app_settings
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');

INSERT INTO app_settings (id, notify_email) VALUES (1, NULL);
```

- [ ] **Step 2: Apply it to the live database**

Run via the Supabase MCP tool `mcp__claude_ai_Supabase__apply_migration` with `project_id: sktpzvlmeegyuqsvtunx`, `name: solo_counter_fixed`, using the SQL above as `query`.

- [ ] **Step 3: Verify the columns and tables exist**

Run via `mcp__claude_ai_Supabase__execute_sql` (`project_id: sktpzvlmeegyuqsvtunx`):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'solo_sessions' AND column_name IN ('assigned_to_counter', 'restrict_to_list');
SELECT to_regclass('public.solo_session_items'), to_regclass('public.app_settings');
SELECT notify_email FROM app_settings WHERE id = 1;
```

Expected: 2 rows for the first query, both table names resolved (non-null) for the second, one row with `notify_email = NULL` for the third.

- [ ] **Step 4: Commit the migration file to GitHub**

Use `mcp__github__create_branch` (`branch: feat/solo-counter-fixed`, `from_branch: main`), then `mcp__github__create_or_update_file` for `supabase/migrations/022_solo_counter_fixed.sql` on that branch, commit message `feat: migration for fixed solo counter, item list and notify e-mail`.

---

### Task 2: Create the fixed solo-counter account

This is data, not application code — no file changes. Run directly via `mcp__claude_ai_Supabase__execute_sql`.

Team PIN `9000` / user PIN `0001` → login e-mail `90000001@count.local` (checked against all 24 existing `@count.local` accounts and `teams.team_pin` — no collision). If the user wants different digits, swap them here before running.

- [ ] **Step 1: Confirm no collision (already done during planning, re-check if PINs changed)**

```sql
SELECT 1 FROM auth.users WHERE email = '90000001@count.local';
```

Expected: 0 rows.

- [ ] **Step 2: Create the `auth.users` + `auth.identities` rows**

```sql
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    '90000001@count.local',
    crypt('0001', gen_salt('bf', 6)),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"counter","is_solo_counter":true}',
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id::text,
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', '90000001@count.local', 'email_verified', true),
    'email', now(), now(), now()
  );
END $$;
```

- [ ] **Step 3: Verify login credentials work end-to-end**

```sql
SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = '90000001@count.local';
```

Expected: one row, `raw_user_meta_data = {"role":"counter","is_solo_counter":true}`. Actual login (team PIN `9000`, user PIN `0001`) gets tested in Task 6 once `/solo` exists.

No commit — this task only touches the database, not the repo.

---

### Task 3: Refactor `actions/solo.ts` — shared save helper + new actions

**Files:**
- Modify: `actions/solo.ts`

- [ ] **Step 1: Extract `_saveSoloEntry` from `lancarSoloContagem`, add the counter-role helper and all new actions**

Replace the full contents of `actions/solo.ts` with:

```ts
'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import type { LancarContagemPayload, LancarContagemResult } from '@/actions/contagem'
import { sendSoloResultsEmail } from '@/lib/send-solo-results-email'

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'admin'
}

async function isSoloCounter(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.role === 'counter' && user?.user_metadata?.is_solo_counter === true
}

export async function criarSoloSessao(title: string): Promise<{ id?: string; error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  if (!title.trim()) return { error: 'Title is required.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solo_sessions')
    .insert({ title: title.trim() })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

// ponytail: shared by the admin path (lancarSoloContagem) and the counter path
// (lancarSoloContagemCounter) — same validation/convert/save, only the auth check differs
async function _saveSoloEntry(
  sessionId: string,
  payload: LancarContagemPayload,
): Promise<LancarContagemResult> {
  if (payload.pallets < 0 || payload.cases < 0 || payload.units < 0) {
    return { error: 'Values cannot be negative.' }
  }
  if (
    !Number.isInteger(payload.pallets) ||
    !Number.isInteger(payload.cases) ||
    !Number.isInteger(payload.units)
  ) {
    return { error: 'Count values must be integers.' }
  }

  const admin = createAdminClient()
  const { data: item, error: itemError } = await admin
    .from('inventory_items')
    .select('bpu, pallet_size, brand_name')
    .eq('brand_code', payload.brand_code)
    .single()

  if (itemError || !item) return { error: 'Item not found.' }
  if (!item.bpu) return { error: 'Item has incomplete data — please contact the admin.' }

  const { data: converted, error: convError } = await admin.rpc('convert_count', {
    p_pallets: payload.pallets,
    p_cases: payload.cases,
    p_units: payload.units,
    p_bpu: item.bpu,
    p_pallet_size: item.pallet_size,
  })
  if (convError || !converted) return { error: 'Error converting count.' }

  const row = Array.isArray(converted) ? converted[0] : converted
  const final_cases = row.final_cases as number
  const final_units = row.final_units as number

  const { error } = await admin.from('solo_entries').upsert(
    {
      session_id: sessionId,
      brand_code: payload.brand_code,
      brand_name: item.brand_name,
      pallets: payload.pallets,
      cases: payload.cases,
      units: payload.units,
      final_cases,
      final_units,
      is_weight_count: payload.is_weight_count ?? false,
      counted_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,brand_code' },
  )
  if (error) return { error: `Error saving: ${error.message}` }

  return { final_cases, final_units, brand_name: item.brand_name }
}

export async function lancarSoloContagem(
  sessionId: string,
  payload: LancarContagemPayload,
): Promise<LancarContagemResult> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  return _saveSoloEntry(sessionId, payload)
}

export async function encerrarSoloSessao(sessionId: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }
  return {}
}

// ─── Assignment (admin) ──────────────────────────────────────────────────────

export async function atribuirSoloContador(
  sessionId: string,
  assigned: boolean,
  restrict: boolean,
): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_sessions')
    .update({ assigned_to_counter: assigned, restrict_to_list: restrict })
    .eq('id', sessionId)
  return error ? { error: error.message } : {}
}

export async function adicionarItemListaSolo(sessionId: string, brandCode: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_session_items')
    .upsert({ session_id: sessionId, brand_code: brandCode }, { onConflict: 'session_id,brand_code' })
  return error ? { error: error.message } : {}
}

export async function removerItemListaSolo(sessionId: string, brandCode: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('solo_session_items')
    .delete()
    .eq('session_id', sessionId)
    .eq('brand_code', brandCode)
  return error ? { error: error.message } : {}
}

export async function buscarNotifyEmail(): Promise<string> {
  if (!(await isAdmin())) return ''
  const admin = createAdminClient()
  const { data } = await admin.from('app_settings').select('notify_email').eq('id', 1).single()
  return data?.notify_email ?? ''
}

export async function salvarNotifyEmail(email: string): Promise<{ error?: string }> {
  if (!(await isAdmin())) return { error: 'Unauthorized' }
  const trimmed = email.trim()
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: 'Invalid email address.' }
  const admin = createAdminClient()
  const { error } = await admin.from('app_settings').update({ notify_email: trimmed || null }).eq('id', 1)
  return error ? { error: error.message } : {}
}

// ─── Counter-facing (fixed solo-counter account) ────────────────────────────

export async function listarSoloSessoesAtribuidas(): Promise<{ id: string; title: string; counter_name: string | null }[]> {
  if (!(await isSoloCounter())) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('solo_sessions')
    .select('id, title, counter_name')
    .eq('assigned_to_counter', true)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function definirNomeContadorSolo(sessionId: string, nome: string): Promise<{ error?: string }> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }
  if (!nome.trim()) return { error: 'Name is required.' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  // ponytail: .is('counter_name', null) — only the first person to open the
  // session sets the name; later re-opens by the same shared account don't overwrite it
  const { error } = await admin
    .from('solo_sessions')
    .update({ counter_name: nome.trim() })
    .eq('id', sessionId)
    .is('counter_name', null)
  return error ? { error: error.message } : {}
}

export async function lancarSoloContagemCounter(
  sessionId: string,
  payload: LancarContagemPayload,
): Promise<LancarContagemResult> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status, restrict_to_list')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  if (session.restrict_to_list) {
    const { data: allowed } = await admin
      .from('solo_session_items')
      .select('brand_code')
      .eq('session_id', sessionId)
      .eq('brand_code', payload.brand_code)
      .maybeSingle()
    if (!allowed) return { error: 'Item is not in the pre-selected list for this count.' }
  }

  return _saveSoloEntry(sessionId, payload)
}

export async function finalizarSoloContagemCounter(sessionId: string): Promise<{ error?: string }> {
  if (!(await isSoloCounter())) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('solo_sessions')
    .select('assigned_to_counter, status, title, counter_name')
    .eq('id', sessionId)
    .single()
  if (!session || !session.assigned_to_counter || session.status !== 'open') {
    return { error: 'Session not available.' }
  }

  const { error } = await admin.from('solo_sessions').update({ status: 'closed' }).eq('id', sessionId)
  if (error) return { error: error.message }

  const { data: entries } = await admin
    .from('solo_entries')
    .select('brand_code, brand_name, final_cases, final_units')
    .eq('session_id', sessionId)
    .order('brand_code')

  const { data: settings } = await admin.from('app_settings').select('notify_email').eq('id', 1).single()
  if (settings?.notify_email) {
    // ponytail: failure here must never block the finalise — session is already closed above
    await sendSoloResultsEmail(settings.notify_email, session.title, session.counter_name, entries ?? [])
  }

  return {}
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build` (or `npx tsc --noEmit` if faster) locally against the checked-out branch.
Expected: fails at this point because `@/lib/send-solo-results-email` doesn't exist yet — that's fine, confirms the import is wired; Task 4 creates it. If any *other* error appears, fix it before moving on.

- [ ] **Step 3: Commit**

`mcp__github__create_or_update_file` for `actions/solo.ts` on `feat/solo-counter-fixed`, message `feat: solo counter actions — assignment, item list, notify e-mail, counter-role flow`.

---

### Task 4: E-mail on finalise (Resend)

**Files:**
- Modify: `package.json`
- Create: `lib/send-solo-results-email.ts`

- [ ] **Step 1: Add the `resend` dependency**

Add `"resend": "^4.0.0"` to `dependencies` in `package.json` (alongside the existing `xlsx`, `qrcode` entries), keeping the rest of the file unchanged.

- [ ] **Step 2: Write the e-mail helper**

```ts
// lib/send-solo-results-email.ts
import { Resend } from 'resend'

type SoloEntryRow = {
  brand_code: string
  brand_name: string | null
  final_cases: number
  final_units: number
}

function buildHtmlTable(rows: SoloEntryRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.brand_name ?? ''}</td><td>${r.brand_code}</td><td>${r.final_cases}</td><td>${r.final_units}</td><td>Avl</td></tr>`
    )
    .join('')

  return `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9">
          <th>Brand Name</th><th>Brand Code</th><th>Count Qty (Outers)</th><th>Count Qty (Units)</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `
}

// ponytail: failure here is logged, never thrown — the caller has already
// closed the session and must not roll that back just because the e-mail failed
export async function sendSoloResultsEmail(
  to: string,
  sessionTitle: string,
  counterName: string | null,
  entries: SoloEntryRow[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('sendSoloResultsEmail: RESEND_API_KEY not configured, skipping.')
    return
  }
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'Count Stock <onboarding@resend.dev>',
      to,
      subject: `Solo Count finalised: ${sessionTitle}`,
      html: `<p>Solo count <strong>${sessionTitle}</strong> was finalised by ${counterName ?? 'a counter'}.</p>${buildHtmlTable(entries)}`,
    })
  } catch (err) {
    console.error('sendSoloResultsEmail: failed to send', err)
  }
}
```

`onboarding@resend.dev` is Resend's shared sender that works with zero setup on a free account — no domain verification needed to get this working today. Swap the `from` address for a verified domain later if the user wants their own sender identity.

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes now (Task 3's import resolves).

- [ ] **Step 4: Commit**

Files: `package.json`, `lib/send-solo-results-email.ts`. Message: `feat: send solo count results by e-mail via Resend on counter finalise`.

- [ ] **Step 5: Tell the user to set `RESEND_API_KEY`**

This step has no code — flag it back to the user in chat: they need a free resend.com account and to add `RESEND_API_KEY` in the Vercel project's environment variables (Production **and** Preview, since preview deploys share the same finalise flow). Until it's set, `finalizarSoloContagemCounter` still works — it just skips the e-mail and logs a warning (Step 2's guard).

---

### Task 5: Route the fixed counter to `/solo` on login

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Update the redirect logic**

Replace the two `if (user) { ... }` blocks in `proxy.ts` (the post-login redirect and the role-gate block) with:

```ts
  if (user && (pathname === '/' || pathname === '/login')) {
    const role = user.user_metadata?.role
    const isSoloCounter = user.user_metadata?.is_solo_counter === true
    return NextResponse.redirect(
      new URL(role === 'admin' ? '/admin' : isSoloCounter ? '/solo' : '/busca', request.url)
    )
  }

  if (user) {
    const role = user.user_metadata?.role
    const isSoloCounter = user.user_metadata?.is_solo_counter === true
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL(isSoloCounter ? '/solo' : '/busca', request.url))
    }
    if (pathname.startsWith('/busca') && role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (pathname.startsWith('/busca') && isSoloCounter) {
      return NextResponse.redirect(new URL('/solo', request.url))
    }
    if (pathname.startsWith('/solo') && role !== 'admin' && !isSoloCounter) {
      return NextResponse.redirect(new URL('/busca', request.url))
    }
  }
```

Leave the rest of the file (the `!user` redirect, the Supabase client setup, `export const config`) untouched.

- [ ] **Step 2: Type-check**

Run: `npm run build`. Expected: passes.

- [ ] **Step 3: Commit**

File: `proxy.ts`. Message: `feat: redirect the fixed solo counter to /solo after login`.

---

### Task 6: Counter-facing routes (`/solo`)

**Files:**
- Create: `app/solo/layout.tsx`
- Create: `app/solo/page.tsx`
- Create: `app/solo/[id]/page.tsx`
- Create: `app/solo/[id]/_components/SoloCounterClient.tsx`

- [ ] **Step 1: Minimal layout (header + logout, no team/session banner logic — the fixed counter has no `team_id`)**

```tsx
// app/solo/layout.tsx
import { logout } from '@/actions/auth'

export default function SoloLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-white text-base">Count Stock — Solo</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-400 hover:text-white">
            Log out
          </button>
        </form>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: List of sessions assigned to this account**

```tsx
// app/solo/page.tsx
import Link from 'next/link'
import { listarSoloSessoesAtribuidas } from '@/actions/solo'

export default async function SoloListPage() {
  const sessions = await listarSoloSessoesAtribuidas()

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Solo Counts assigned to you</h2>
      <div className="space-y-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/solo/${s.id}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:bg-slate-50"
          >
            <div className="font-semibold text-slate-900">{s.title}</div>
            {s.counter_name && (
              <div className="text-xs text-slate-400 mt-1">Counted by {s.counter_name}</div>
            )}
          </Link>
        ))}
        {sessions.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No solo counts assigned to you right now.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Session page — loads items (filtered if restricted), delegates to the client component**

```tsx
// app/solo/[id]/page.tsx
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
    .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name')
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
        box_tare_g: 300,
        bins: [],
        jaContado: !!e,
        entryExistente: e ? { pallets: e.pallets, cases: e.cases, units: e.units } : null,
      }
    })

  return <SoloCounterClient sessionId={id} title={session.title} counterName={session.counter_name} items={items} />
}
```

- [ ] **Step 4: Client component — name gate, then counting UI reusing `BuscaClient`**

```tsx
// app/solo/[id]/_components/SoloCounterClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagemCounter, finalizarSoloContagemCounter, definirNomeContadorSolo } from '@/actions/solo'

type Props = {
  sessionId: string
  title: string
  counterName: string | null
  items: ItemBusca[]
}

export function SoloCounterClient({ sessionId, title, counterName, items }: Props) {
  const [name, setName] = useState(counterName)
  const [nameInput, setNameInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const onSubmit = (payload: LancarContagemPayload) => lancarSoloContagemCounter(sessionId, payload)

  function handleSetName(e: React.FormEvent) {
    e.preventDefault()
    if (!nameInput.trim()) return
    startTransition(async () => {
      const res = await definirNomeContadorSolo(sessionId, nameInput)
      if (res.error) { setErro(res.error); return }
      setName(nameInput.trim())
    })
  }

  function handleFinalise() {
    startTransition(async () => {
      const res = await finalizarSoloContagemCounter(sessionId)
      if (res.error) { setErro(res.error); return }
      router.push('/solo')
    })
  }

  if (!name) {
    return (
      <form onSubmit={handleSetName} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">Enter your name before you start counting.</p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
          autoFocus
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900"
        />
        {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>}
        <button
          type="submit"
          disabled={isPending || !nameInput.trim()}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
        >
          Start counting →
        </button>
      </form>
    )
  }

  const header = (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <button
          onClick={handleFinalise}
          disabled={isPending}
          className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 hover:bg-slate-700 disabled:opacity-40"
        >
          {isPending ? '...' : 'Finalise Count'}
        </button>
      </div>
      {erro && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
    </div>
  )

  return <BuscaClient items={items} onSubmit={onSubmit} headerSlot={header} />
}
```

- [ ] **Step 5: Type-check**

Run: `npm run build`. Expected: passes.

- [ ] **Step 6: Commit**

Files: the four new files above. Message: `feat: counter-facing solo count routes (/solo)`.

- [ ] **Step 7: Manual verification (needs Task 7 done first for an assigned session to exist — come back to this step after Task 7)**

Open a Vercel preview deploy for this branch. Log in with team PIN `9000` / user PIN `0001`. Confirm: redirected to `/solo`; an assigned session (created in Task 7's manual check) is listed; opening it prompts for a name; after entering a name, the search screen from `BuscaClient` appears; counting and "Finalise Count" work; after finalising, redirected to `/solo` and the session is no longer listed (closed).

---

### Task 7: Admin — assignment panel and item list builder

**Files:**
- Create: `app/admin/solo/[id]/_components/AssignmentPanel.tsx`
- Modify: `app/admin/solo/[id]/page.tsx`
- Modify: `app/admin/solo/[id]/_components/SoloCountClient.tsx`

- [ ] **Step 1: Write `AssignmentPanel`**

```tsx
// app/admin/solo/[id]/_components/AssignmentPanel.tsx
'use client'

import { useState, useTransition } from 'react'
import type { ItemBusca } from '@/actions/contagem'
import { atribuirSoloContador, adicionarItemListaSolo, removerItemListaSolo } from '@/actions/solo'

type ListItem = { brand_code: string; brand_name: string }

type Props = {
  sessionId: string
  inventory: ItemBusca[]
  assignedToCounter: boolean
  restrictToList: boolean
  listItems: ListItem[]
  onAssignedChange: (v: boolean) => void
  onRestrictChange: (v: boolean) => void
}

export function AssignmentPanel({
  sessionId,
  inventory,
  assignedToCounter,
  restrictToList,
  listItems: initialListItems,
  onAssignedChange,
  onRestrictChange,
}: Props) {
  const [listItems, setListItems] = useState(initialListItems)
  const [termo, setTermo] = useState('')
  const [isPending, startTransition] = useTransition()

  const listedCodes = new Set(listItems.map((i) => i.brand_code))
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

  function setAssigned(next: boolean) {
    startTransition(async () => {
      await atribuirSoloContador(sessionId, next, restrictToList)
      onAssignedChange(next)
    })
  }

  function setRestrict(next: boolean) {
    startTransition(async () => {
      await atribuirSoloContador(sessionId, assignedToCounter, next)
      onRestrictChange(next)
    })
  }

  function addItem(item: ItemBusca) {
    setListItems((prev) => [...prev, { brand_code: item.brand_code, brand_name: item.brand_name }])
    setTermo('')
    startTransition(async () => {
      await adicionarItemListaSolo(sessionId, item.brand_code)
    })
  }

  function removeItem(brandCode: string) {
    setListItems((prev) => prev.filter((i) => i.brand_code !== brandCode))
    startTransition(async () => {
      await removerItemListaSolo(sessionId, brandCode)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-slate-700">Who counts</span>
        <div className="flex gap-2">
          <button
            onClick={() => setAssigned(false)}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${!assignedToCounter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
          >
            Myself
          </button>
          <button
            onClick={() => setAssigned(true)}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${assignedToCounter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
          >
            Solo counter
          </button>
        </div>
      </div>

      {assignedToCounter && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-slate-700">Item list</span>
            <div className="flex gap-2">
              <button
                onClick={() => setRestrict(false)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${!restrictToList ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
              >
                Free add
              </button>
              <button
                onClick={() => setRestrict(true)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${restrictToList ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
              >
                Restricted list
              </button>
            </div>
          </div>

          {restrictToList && (
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
                {listItems.map((i) => (
                  <span key={i.brand_code} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-xs">
                    {i.brand_code}
                    <button onClick={() => removeItem(i.brand_code)} className="text-slate-400 hover:text-red-500">
                      ✕
                    </button>
                  </span>
                ))}
                {listItems.length === 0 && <span className="text-xs text-slate-400">No items added yet.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Load the new session columns and the pre-selected list in the page**

In `app/admin/solo/[id]/page.tsx`, add `assigned_to_counter, restrict_to_list, counter_name` to the `solo_sessions` select, add a 4th parallel fetch for `solo_session_items`, and pass the new props through:

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
      .select('id, title, status, assigned_to_counter, restrict_to_list, counter_name')
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
      box_tare_g: 300,
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

- [ ] **Step 3: Branch `SoloCountClient` on `assignedToCounter`**

Replace the full contents of `app/admin/solo/[id]/_components/SoloCountClient.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ItemBusca, LancarContagemPayload } from '@/actions/contagem'
import { BuscaClient } from '@/app/(counter)/busca/_components/BuscaClient'
import { lancarSoloContagem, encerrarSoloSessao } from '@/actions/solo'
import { AssignmentPanel } from './AssignmentPanel'

type Entry = { brand_code: string; brand_name: string | null; final_cases: number; final_units: number }
type ListItem = { brand_code: string; brand_name: string }

type Props = {
  sessionId: string
  title: string
  status: string
  items: ItemBusca[]
  entries: Entry[]
  assignedToCounter: boolean
  restrictToList: boolean
  counterName: string | null
  listItems: ListItem[]
}

export function SoloCountClient({
  sessionId,
  title,
  status: initialStatus,
  items,
  entries,
  assignedToCounter: initialAssigned,
  restrictToList: initialRestrict,
  counterName,
  listItems,
}: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [assignedToCounter, setAssignedToCounter] = useState(initialAssigned)
  const [restrictToList, setRestrictToList] = useState(initialRestrict)
  const [finalising, startFinalise] = useTransition()
  const router = useRouter()
  const isOpen = status === 'open'

  const onSubmit = (payload: LancarContagemPayload) => lancarSoloContagem(sessionId, payload)

  function handleFinalise() {
    startFinalise(async () => {
      const res = await encerrarSoloSessao(sessionId)
      if (!res.error) {
        setStatus('closed')
        router.refresh()
      }
    })
  }

  // ponytail: monitor refreshes via polling, not Postgres Realtime — Realtime would need
  // a new publication entry + RLS-visible reads from the client's own JWT (currently every
  // solo read/write goes through 'use server' actions on the service-role client). Swap for
  // a Realtime channel (same setAuth pattern as the team monitor) if 5s latency is too slow.
  useEffect(() => {
    if (!assignedToCounter || !isOpen) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [assignedToCounter, isOpen, router])

  const header = (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Link href="/admin/solo" className="text-slate-400 hover:text-slate-900 text-sm">← Solo Count</Link>
        <span className="text-slate-300">/</span>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isOpen ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {status}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/api/solo/${sessionId}/export`}
          className="text-sm font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-2"
        >
          ↓ Export Excel
        </a>
        {isOpen && !assignedToCounter && (
          <button
            onClick={handleFinalise}
            disabled={finalising}
            className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 hover:bg-slate-700 disabled:opacity-40"
          >
            {finalising ? '...' : 'Finalise Solo Count'}
          </button>
        )}
      </div>
    </div>
  )

  const sorted = [...entries].sort((a, b) => a.brand_code.localeCompare(b.brand_code))
  const resultsTable = (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Code</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand Name</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.length === 0 ? (
            <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-400">No items counted.</td></tr>
          ) : (
            sorted.map((e) => (
              <tr key={e.brand_code} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-700">{e.brand_code}</td>
                <td className="px-4 py-3 text-slate-600">{e.brand_name}</td>
                <td className="px-4 py-3 text-center font-mono">{e.final_cases}+{e.final_units}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  const assignmentPanel = (
    <AssignmentPanel
      sessionId={sessionId}
      inventory={items}
      assignedToCounter={assignedToCounter}
      restrictToList={restrictToList}
      listItems={listItems}
      onAssignedChange={setAssignedToCounter}
      onRestrictChange={setRestrictToList}
    />
  )

  if (assignedToCounter) {
    return (
      <div>
        {header}
        {isOpen && assignmentPanel}
        <div className="text-sm text-slate-500 mb-3">
          {counterName ? `Counting by: ${counterName}` : 'Waiting for the counter to enter their name…'}
        </div>
        {resultsTable}
      </div>
    )
  }

  if (!isOpen) {
    return (
      <div>
        {header}
        {resultsTable}
      </div>
    )
  }

  return (
    <BuscaClient
      items={items}
      onSubmit={onSubmit}
      headerSlot={
        <>
          {header}
          {assignmentPanel}
        </>
      }
    />
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`. Expected: passes.

- [ ] **Step 5: Commit**

Files: the three files above. Message: `feat: admin assignment panel — assign solo counter, pre-selected item list`.

- [ ] **Step 6: Manual verification (create the session used by Task 6's check)**

On the preview deploy, log in as admin. `/admin/solo` → "New Solo Count" → give it a title. On the session page, switch "Who counts" to "Solo counter", switch "Item list" to "Restricted list", search and add 2–3 items. Confirm the chips appear and the counting form (BuscaClient) is gone, replaced by "Waiting for the counter to enter their name…" and an empty results table. Now go run Task 6 Step 7 using this session, then come back here and confirm the results table updates (within ~5s of a `router.refresh()`, or navigate away and back) as the counter logs entries, and that finalising it flips the admin view.

---

### Task 8: Admin — notify e-mail setting

**Files:**
- Create: `app/admin/solo/_components/NotifyEmailForm.tsx`
- Modify: `app/admin/solo/page.tsx`

- [ ] **Step 1: Write the form**

```tsx
// app/admin/solo/_components/NotifyEmailForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { salvarNotifyEmail } from '@/actions/solo'

export function NotifyEmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [saved, setSaved] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSaved(false)
    startTransition(async () => {
      const res = await salvarNotifyEmail(email)
      if (res.error) { setErro(res.error); return }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Notification e-mail (solo counter results)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
          placeholder="admin@example.com"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-semibold bg-slate-900 text-white rounded-xl px-4 py-2 disabled:opacity-40"
      >
        {isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
      </button>
      {erro && <div className="w-full text-sm text-red-700">{erro}</div>}
    </form>
  )
}
```

- [ ] **Step 2: Wire it into the list page**

In `app/admin/solo/page.tsx`, add the import and load call, and render the form above `<SoloCreateForm />`:

```tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-admin'
import { SoloCreateForm } from './_components/SoloCreateForm'
import { NotifyEmailForm } from './_components/NotifyEmailForm'
import { buscarNotifyEmail } from '@/actions/solo'

export default async function AdminSoloPage() {
  const admin = createAdminClient()
  const [{ data: sessions }, notifyEmail] = await Promise.all([
    admin.from('solo_sessions').select('id, title, status, created_at').order('created_at', { ascending: false }),
    buscarNotifyEmail(),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Solo Count</h2>
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-900">← Dashboard</Link>
      </div>

      <NotifyEmailForm initialEmail={notifyEmail} />
      <SoloCreateForm />

      <div className="mt-6 space-y-3">
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

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes.

- [ ] **Step 4: Commit**

Files: the two files above. Message: `feat: admin can set the notification e-mail for solo counter results`.

- [ ] **Step 5: Manual verification**

On the preview deploy, `/admin/solo` shows the e-mail field. Set it to an inbox you control, save, reload the page — the value persists (confirms it round-trips through `app_settings`).

---

### Task 9: End-to-end verification, ponytail-review, PR

- [ ] **Step 1: Full walkthrough on the preview deploy**

1. Admin sets notify e-mail (Task 8).
2. Admin creates a solo session, assigns it to "Solo counter", restricts it to a 3-item list (Task 7).
3. Log out, log in as `9000`/`0001` → lands on `/solo`, session listed.
4. Open it, enter a name, confirm the search only returns the 3 listed items (type a code that exists in inventory but isn't on the list — expect "No items found").
5. Count 2 of the 3 items, leave 1 uncounted.
6. Back on the admin tab, refresh — results table shows the 2 counted items, counter name shown.
7. As the counter, click "Finalise Count" — redirected to `/solo`, session no longer listed.
8. Check the notify inbox: e-mail arrived with an HTML table containing exactly the 2 counted items (`Brand Name, Brand Code, Count Qty (Outers), Count Qty (Units), Status=Avl`) — the uncounted 3rd item is **not** present.
9. As admin, confirm `/admin/solo/[id]` now shows the closed-session results table (same 2 items) and the session no longer shows the assignment panel controls as editable in a confusing way (it's closed, so `isOpen` is false and the panel is hidden — expected per Task 7 Step 3's `{isOpen && assignmentPanel}`).
10. Separately, create a second solo session and leave it unassigned — confirm the admin can still count it directly exactly as before this feature existed (regression check).

Fix anything that doesn't match before proceeding.

- [ ] **Step 2: Run `/ponytail-review` on the branch**

Invoke the `ponytail-review` skill against the diff on `feat/solo-counter-fixed` vs `main`. Address anything it flags — this is required before opening the PR, not optional.

- [ ] **Step 3: Open the PR**

Use `mcp__github__create_pull_request` from `feat/solo-counter-fixed` into `main`. Title: `feat: fixed solo counter — pre-selected list, assignment, e-mail results`. Body should summarise the 3 user-facing changes (fixed counter login, restricted/free item list, e-mail on finalise) and link `docs/superpowers/specs/2026-07-30-solo-count-fixed-counter-design.md`. **Do not merge** — wait for the user's explicit go-ahead in that session, per this project's standing rule (2 prior unauthorised-merge incidents).
