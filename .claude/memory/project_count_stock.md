---
name: project-count-stock
description: "Count Stock — contagem física cega tripla: stack, fluxo, PRs #1–#45 e #48 mergeados; #47 (solo PIN login) ABANDONADA; item não contado = 0 no merge; prod resetada"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-07-02
  originSessionId: cc63e5ca-5312-44b8-b967-5637df8cc275
---

# Count Stock — Sistema de Contagem Cega Tripla

## Links de acesso
- **GitHub**: https://github.com/ycristan/ProjectCountStock (público)
- **Supabase projeto**: https://supabase.com/dashboard/project/sktpzvlmeegyuqsvtunx
- **Vercel dashboard**: https://vercel.com/ycristans-projects/project-count-stock-ylmm
- **App URL produção**: derivado do host do request em runtime (sem env var hardcoded)

## Estado atual (2026-07-02)
- **Produção foi RESETADA**: apagados todos os dados de contagem/equipes/sessões/solo/audit e todos os usuários contadores. Mantidos APENAS o **admin (1 usuário)** e o **inventário** (`inventory_items` 402 itens + `item_bin_locations` 282). Banco pronto pra uso limpo.
- Variável importante: **preview e produção usam o MESMO Supabase** (`sktpzvlmeegyuqsvtunx`). Não há banco por branch. Dado de teste em preview vai pra produção também.
- **Migrations NÃO são aplicadas automaticamente no merge** — aplicar à mão (via Supabase MCP `apply_migration` ou dashboard).

## Stack
- Next.js 16.2.9 + React 19 + TypeScript (strict, sem noUnusedLocals — unused vars pegam no `next build`/ESLint)
- Tailwind CSS 4 + `@tailwindcss/postcss`
- Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/ssr`
- `xlsx` — upload/download de inventário e exportação Excel
- `qrcode` — QR codes server-side (PR #23)

## Admin
- `user_metadata`: `{"role":"admin","full_name":"Yuri"}`
- Credenciais: ver password manager / Supabase dashboard

## Auth — padrão 2-PIN (contadores triplos)
- Email Supabase: `${team_pin}${user_pin}@count.local`; Senha: `user_pin` (4 dígitos)
- `user_metadata.role`: `'admin'` ou `'counter'`
- `user_metadata.full_name`: nome real; `user_metadata.counter_role`: `'contador_1'|'contador_2'|'independente'`; `user_metadata.team_id`
- Login (`actions/auth.ts`) aceita 2-PIN (contador) ou email+senha (admin). Redireciona pra `/`.

## Solo Count
### Modo Admin (PR #43, mergeado)
- Contagem conduzida pelo próprio admin — sem PIN, sem reconciliação. `/admin/solo` → New (só título) → `/admin/solo/[id]` (SoloCountClient reusa BuscaClient/CountForm) → Finalise → Export.
### Modo Contador com PIN (PR #47) — ABANDONADO
- Tentou-se dar acesso a um contador solo. Duas variantes falharam e a **PR #47 foi FECHADA sem merge**. Ver [[project-count-stock-architecture]] (armadilhas) e a lição abaixo. Não reabrir sem repensar do zero.

## Regra: item não contado = 0 no merge final (PR #48, mergeado)
- Todo item do `inventory_items` que **nenhuma equipe** contou aparece no resultado final como **0** — **não imputado a nenhuma equipe** (regra de sessão).
- Aplicada nos 3 produtores do merge, iterando o inventário inteiro (não só os códigos contados):
  1. `app/api/sessao/[id]/export/route.ts` — abas Consolidado + Template.
  2. `app/admin/sessao/[id]/combinacao/_components/CombinacaoClient.tsx` — aba Merged.
  3. `combine_session_results` (migration 019, **aplicada no banco**) — loop externo sobre `inventory_items`.
- Abas/telas por-equipe ficam iguais (zeros são de sessão, nunca de equipe).

## Regra BPU=1
- `item.bpu === 1`: Pallets e Cases `disabled` no CountForm; só Units editável. Edit mode pré-carrega `units = entry.cases + entry.units`.

## Nomes dos contadores
- NÃO em `counter_accounts.username` (esse guarda `team_pin+user_pin`). Estão em `auth.users.raw_user_meta_data->>'full_name'`.
- Buscar via `createAdminClient().auth.admin.listUsers({ perPage: 1000 })` → filtrar por team_id/counter_role.

## Fluxo completo — Contagem Tripla
1. Admin cria sessão (nº equipes, box_tare_g, tolerance_g). 2. Cria equipes (team_pin+user_pin, cartões QR). 3. Contadores 1 e 2 contam cego. 4. Independente **não conta** — vai pra /monitor. 5. Admin “Check →” → RPC `finalize_team_count` → gera reconciliation_items. 6. Independente reconcilia discrepâncias. 7. Admin monitora ao vivo. 8. Independente confirma → status 'reconciliada'. 9. Admin → Combinação → Confirm → RPC `combine_session_results` → `combined_results`. 10. Export Excel.

## Migrations (supabase/migrations)
001 schema | 002 functions | 003 rls | 004 finalized_at | 005 weight_avg | 006 category | 007 reconc_recount | 008 weight_marker | 009 realtime+admin_rls | 010 remove_bin_from_finalize | 011 combine_session | 012 fix_count_entries_dup | 013 finalize_c1_c2_only | 014 fix_combine_no_discrepancy | 016 solo_sessions | 017 tolerance | **019 combine_all_inventory (merge inclui inventário inteiro — não contado=0; APLICADA)**
(015 independente_confirm existe; 018 solo_pin ficou só na branch abandonada #47)

## PRs
- Mergeados: #1–#45 e **#48** (item não contado = 0 no merge).
- **#47 (solo count PIN para contador) — FECHADA/ABANDONADA** (login por codinome+PIN nunca funcionou; ver lição).
- **#46 (dead code cleanup, ~1471 linhas)** — ainda OPEN.

## Lição: solo-PIN login (não repetir)
Tentativa: contador solo logar pela tela normal com codinome+PIN, achando a sessão solo aberta e setando cookie `solo_pin_<id>` pra cair em `/solo/[id]/contar`. Sintoma: `POST /login → 303` achava a sessão certo, mas `GET /solo/[id]/contar → 307` (cookie httpOnly ausente na requisição seguinte) → bounce pro login. Dado/deploy OK. 2 tentativas (redirect no servidor; depois set-cookie + nav client-side igual ao PinForm) NÃO resolveram. Causa raiz do bounce NÃO foi achada. Se voltar: investigar por que o cookie não sobrevive até /contar, ou repensar (ex.: contador solo como usuário Supabase real).

## Armadilha crítica: TypeScript 5.7 + xlsx + BodyInit
- `XLSX.write(wb,{type:'array'})` → `Uint8Array<ArrayBufferLike>` não assignável a `BodyInit`. Fix: `as unknown as BodyInit`.

## Workflow
- Todo código via GitHub MCP (`mcp__github__*`) — branch + PR + squash. Push direto na main só se o usuário pedir (docs/memory ok).
- Editar arquivos grandes: clonar local + Edit cirúrgico (o GitHub MCP não faz patch de linha; reproduzir arquivo inteiro arrisca).
- [[project-count-stock-architecture]] para padrões técnicos críticos.
