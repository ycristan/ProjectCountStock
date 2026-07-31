# System Settings + Unified Session Creation Wizard — Design

Amendment to `docs/superpowers/specs/2026-07-30-solo-count-fixed-counter-design.md`, same feature branch (`feat/solo-counter-fixed`, PR #58, still unapproved). Triggered by user testing the PR #58 preview and finding real product gaps, not just polish:

1. No UI anywhere shows or manages the fixed solo counter's PIN — it only exists because the assistant told the user in chat. The admin has no way to see, rotate, or remove it.
2. Solo count's weight-based tara is hardcoded to `300` in code with no admin-facing control — a pre-existing bug (predates this PR) that becomes more painful now that a second entry point (the counter's own `/solo` screen) also depends on it.
3. Session creation for solo count has no explicit "confirm" step — settings (who counts, list mode) are toggles on the session's detail page that save immediately and silently, which reads as unfinished/confusing rather than a deliberate creation flow.

## Root cause, not symptom

The underlying issue in all three: solo-count settings were built as after-the-fact, page-level controls instead of as first-class, visible configuration. This design fixes that by (a) giving every cross-cutting setting one visible home, and (b) making solo session creation an explicit, reviewable, one-shot wizard — mirroring how team session creation already works (a form → one submit → done), instead of the create-then-adjust pattern the PR shipped with.

## Out of scope

- Multiple simultaneous solo counter accounts (user confirmed: one at a time — "criar novo" retires the previous one).
- Removing the post-creation `AssignmentPanel` on `/admin/solo/[id]` — it stays as the escape hatch for adjusting an already-created session (swap who counts, add list items mid-count). The wizard is for creation only.
- Any change to the team-count reconciliation flow, RLS model, or e-mail-on-finalise logic from the original spec — all of that is unchanged and already reviewed.

## A. System Settings (`/admin/settings`, new)

One page, three sections:

**Defaults**
- Default Tare (g) — number input, used for both team and solo weight-count. Replaces the "Box Tare (grams)" field currently on the team session creation form.
- Default Weight Tolerance (g) — number input, team-only concept (solo has no reconciliation). Replaces "Weight Tolerance (grams)" on the team session creation form.
- Both are **snapshotted onto each session at creation time** (already how `count_sessions.box_tare_g`/`tolerance_g` behave today — no change to that mechanic, only to where the value comes from). Changing a default here never affects sessions already created — confirmed explicitly by the user.

**Solo Counter**
- Status line: "Active — you can assign sessions to it" / "No solo counter configured — sessions can't be assigned until you create one."
- **Create New Solo Counter** button → calls a new action that deletes any existing fixed-counter account first (only one at a time, per user's answer), generates a fresh non-colliding team_pin+user_pin pair, creates the Supabase Auth account via `admin.auth.admin.createUser()` (the same method `criarEquipes` in `actions/sessao.ts` already uses for team counters — no more manual SQL, since this runs as real app code on Vercel, not in this assistant's sandboxed session), and displays the new PIN pair **once**, in the same reveal-once pattern already used after creating team counters (credentials shown on screen, not persisted anywhere retrievable — Supabase never lets you read a password back). A "copy" affordance and a "you won't see this again" note.
- **Delete Solo Counter** button (only shown when active) → deletes the auth account. Sessions already `assigned_to_counter=true` are unaffected in the database (their counted entries stay); nobody can log in as that account until a new one is created. Admin can always take a stuck session back via the existing `AssignmentPanel` "Myself" toggle.

**Notifications**
- Notification e-mail (solo counter results) — moves here verbatim from `/admin/solo` (same field, same `buscarNotifyEmail`/`salvarNotifyEmail`-equivalent actions, just relocated).

## B. Team session creation (`/admin/sessao/team`, moved from `/admin/sessao`)

Same form as today minus the "Box Tare (grams)" and "Weight Tolerance (grams)" fields and their `<p>` hint text. Only remaining field: "Number of Teams". `criarSessao` (`actions/sessao.ts`) no longer reads `box_tare_g`/`tolerance_g` from `FormData` — it reads `app_settings.default_box_tare_g`/`default_tolerance_g` (via the admin's own session-scoped Supabase client — the existing `app_settings_admin` RLS policy already permits admin `SELECT`, no client change needed) and writes those into the new `count_sessions` row exactly as before.

## C. Unified "New Session" entry

`/admin/sessao` becomes a two-card picker: **Team Count Session** / **Solo Count Session**. The Dashboard's existing "New Session" card link (`/admin/sessao`) needs no change — it already points here.

- **Team Count Session** card → `/admin/sessao/team` (section B, unchanged flow after that: number of teams → `/admin/sessao/[id]/equipes` as today).
- **Solo Count Session** card → `/admin/sessao/solo` (new multi-step wizard, single client component managing local state across steps, nothing written to the database until the final step):
  1. **Title** — text input.
  2. **Who counts** — "Myself" / "Solo counter" (the latter disabled with a tooltip/hint if Settings reports no active solo counter — points the admin at `/admin/settings`).
  3. **Item list** — "Free add" / "Restricted list". If restricted: inline search-and-add against the full inventory, building a **local, in-memory list** (not written to `solo_session_items` yet — this step's search/add UI is new, small, and purely client-side; it is not the same code as `AssignmentPanel`, which writes to the database on every click because it edits an *already-created* session. Reuse only the substring-filter logic, not the component itself).
  4. **Review & Confirm** — summary of the three prior choices (title, who counts, item count if restricted) and a single **"Confirm & Create Session"** button. This is the explicit confirmation step that was missing.
- On confirm: one new server action creates the `solo_sessions` row (with `box_tare_g` snapshotted from `app_settings.default_box_tare_g`, `assigned_to_counter`/`restrict_to_list` set from the wizard choices) and, if restricted, bulk-inserts `solo_session_items` — then redirects to `/admin/solo/[id]`.

`/admin/solo` (list page) loses its inline "New Solo Count" title-only form (`SoloCreateForm` and the `criarSoloSessao` action it called become dead code — delete both, not orphan them). It keeps only the session list.

## D. Data model

```sql
-- new migration
ALTER TABLE app_settings
  ADD COLUMN default_box_tare_g INT NOT NULL DEFAULT 300 CHECK (default_box_tare_g > 0),
  ADD COLUMN default_tolerance_g INT NOT NULL DEFAULT 0 CHECK (default_tolerance_g >= 0);

ALTER TABLE solo_sessions
  ADD COLUMN box_tare_g INT NOT NULL DEFAULT 300 CHECK (box_tare_g > 0);
-- existing rows backfill to 300 automatically via the column DEFAULT (matches the
-- hardcoded value they were already implicitly using in application code)
```

No RLS changes needed — `app_settings` already has an admin-only policy from the prior migration; `solo_sessions` already has admin-only + counter-scoped policies that cover the new column (RLS is row-level, not column-level, except for the counter role's already-narrow `GRANT UPDATE (counter_name)` which doesn't touch `box_tare_g` — correct, the counter should never change tare mid-count).

Both `app/admin/solo/[id]/page.tsx` and `app/solo/[id]/page.tsx` (the two places that currently hardcode `box_tare_g: 300` in their `ItemBusca` mapping) start selecting `box_tare_g` from the fetched `solo_sessions` row and using that instead of the literal.

## E. Server actions

New file `actions/settings.ts` (system-wide, not solo-specific — pulled out of `actions/solo.ts`):
- `buscarConfigSistema(): Promise<{ default_box_tare_g: number; default_tolerance_g: number; notify_email: string }>` — admin-only.
- `salvarConfigSistema(input: { default_box_tare_g: number; default_tolerance_g: number; notify_email: string }): Promise<{ error?: string }>` — admin-only, same e-mail format validation already in `salvarNotifyEmail` today, plus `> 0` / `>= 0` checks on the two numeric fields mirroring the DB constraints.
- `statusContadorSoloFixo(): Promise<{ active: boolean }>` — admin-only; `true` iff an `auth.users` row with `user_metadata.is_solo_counter = true` exists (via `admin.auth.admin.listUsers()` + filter, same pattern `listarEquipes` already uses).
- `criarContadorSoloFixo(): Promise<{ team_pin?: string; user_pin?: string; error?: string }>` — admin-only. Deletes any existing fixed-counter account first (find via the same filter as above, `admin.auth.admin.deleteUser()`), generates a new team_pin+user_pin pair (reuse the `genPin` helper pattern from `actions/sessao.ts`, checked for collision against `teams.team_pin` and existing `@count.local` emails), creates the account via `admin.auth.admin.createUser()` with `user_metadata: { role: 'counter', is_solo_counter: true }`, returns the pin pair.
- `deletarContadorSoloFixo(): Promise<{ error?: string }>` — admin-only, finds and deletes.

`actions/solo.ts` changes:
- Remove `criarSoloSessao` (superseded by the wizard's action below) and `buscarNotifyEmail`/`salvarNotifyEmail` (moved to `actions/settings.ts`).
- Add `criarSoloSessaoCompleta(input: { title: string; assignedToCounter: boolean; restrictToList: boolean; itemCodes: string[] }): Promise<{ id?: string; error?: string }>` — admin-only. Reads `app_settings.default_box_tare_g`, inserts the `solo_sessions` row with everything set in one go, bulk-inserts `solo_session_items` if `restrictToList`, returns the new id.
- `atribuirSoloContador`, `adicionarItemListaSolo`, `removerItemListaSolo` stay unchanged (still back the post-creation `AssignmentPanel`).

`actions/sessao.ts` changes:
- `criarSessao`: stop reading `box_tare_g`/`tolerance_g` from `FormData`; read from `app_settings` instead (details in section B).

## Testing/verification (mirrors the original spec's approach — no new test framework)

- Existing open solo sessions (created before this migration) must keep working: their `box_tare_g` backfills to 300 via the column default, matching the value they were already implicitly using.
- Create a new solo counter, confirm the old one's login (`90000001@count.local`) stops working and the new PIN pair works.
- Change the Settings tara, create a new team session, confirm the new session's `box_tare_g` reflects the new default while a previously-created open session's value is untouched.
- Full solo wizard walkthrough: title → who counts → restricted list with 2+ items → confirm → lands on `/admin/solo/[id]` with everything already configured, no extra clicks needed.
- `/admin/solo` no longer shows a way to create a session directly; `/admin/sessao` shows the Team/Solo picker.

## Workflow

Same branch (`feat/solo-counter-fixed`), same PR (#58, still unapproved). Migration applied by hand via Supabase MCP as before. `/code-review` on the diff before it's considered done, per the user's explicit request this round — in addition to (not instead of) the existing task-by-task spec+quality review process.
