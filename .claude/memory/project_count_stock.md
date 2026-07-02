---
name: project-count-stock
description: "Count Stock — contagem física cega tripla: stack, fluxo, PRs #1–#45 mergeados, #46 e #47 open; Solo Count admin + PIN counter; tolerance_g; falta: auditoria final"
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

## Stack
- Next.js 16.2.9 + React 19 + TypeScript
- Tailwind CSS 4 + `@tailwindcss/postcss`
- Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/ssr`
- `xlsx` — upload/download de inventário e exportação Excel
- `qrcode` — geração de QR codes server-side (adicionado PR #23)

## Admin
- `user_metadata`: `{"role":"admin","full_name":"Yuri"}`
- Credenciais: ver password manager / Supabase dashboard

## Auth — padrão 2-PIN (contadores triplos)
- Email Supabase: `${team_pin}${user_pin}@count.local`
- Senha Supabase: `user_pin` (4 dígitos)
- `user_metadata.role`: `'admin'` ou `'counter'`
- `user_metadata.full_name`: nome real do contador (ex: "João", "Maria")
- `user_metadata.counter_role`: `'contador_1'`, `'contador_2'`, `'independente'`
- `user_metadata.team_id`: UUID da equipe

## Solo Count — dois modos

### Modo Admin (PR #43)
- Contagem conduzida pelo PRÓPRIO admin — sem PIN, sem cookie, sem reconciliação
- Fluxo: `/admin/solo` → New Solo Count (só pede título) → `/admin/solo/[id]` JÁ É a tela de contagem (SoloCountClient) → Finalise → Export Excel
- RLS admin-only (`FOR ALL USING role='admin'`)

### Modo Contador com PIN (PR #47, migration 018)
- Admin cria sessão com "Assign to a counter" → preenche counter_name + PIN de 4 dígitos
- Admin compartilha URL `/solo/[id]` + PIN com o contador
- Contador acessa `/solo/[id]` → digita PIN → cookie httpOnly 24h → redireciona para `/solo/[id]/contar`
- Tela de contagem: BuscaClient idêntico ao time counter, mas `onSubmit` via `lancarSoloContagemCounter` (cookie-verificado)
- Admin acompanha resultados em `/admin/solo/[id]` como de costume
- `solo_sessions`: `access_pin VARCHAR(4)` + `counter_name TEXT` (NULLs em sessões admin-only)

## Nomes dos contadores (tripla contagem)
- NÃO estão em `counter_accounts.username` (esse campo armazena `team_pin+user_pin`, ex: `41003990`)
- Estão em `auth.users.raw_user_meta_data->>'full_name'`
- Para buscar: `createAdminClient().auth.admin.listUsers({ perPage: 1000 })` → filtrar por `team_id` e `counter_role`
- Padrão nameMap: `nameMap[tid:role] = full_name` (ver `listarEquipes` em `actions/sessao.ts`)

## Regra BPU=1
- Quando `item.bpu === 1` (1cs = 1un): campos Pallets e Cases são `disabled` no CountForm e SoloBuscaClient
- Apenas Units é editável
- Edit mode: pré-carrega `units = entry.cases + entry.units` (BPU=1 normaliza tudo para final_cases)
- Implementado em `CountForm.tsx` (`const noBpu = item.bpu === 1`) e `SoloBuscaClient.tsx`

## Estrutura de pastas chave
```
app/
  admin/
    sessao/[id]/
      equipes/          ← EquipesForm.tsx + EquipesGerenciar.tsx (botão "Cartões QR")
      imprimir/         ← PR #23: cartões com QR code (server component)
      progresso/        ← redirect para /combinacao (PR #29)
      reconciliacao/[teamId]/  ← admin acompanha reconciliação ao vivo (Realtime, PR #23)
      combinacao/       ← tela unificada: progresso ao vivo + reconciliação + combinação (PR #29)
    solo/               ← PR #43: lista + criar sessão solo; PR #47: checkbox "Assign to a counter" + PIN
      [id]/             ← SoloCountClient: busca + contagem + Finalise + Export Excel (admin-only)
  solo/                 ← PR #47: acesso de contador via PIN (sem Supabase auth)
    [id]/               ← PIN entry page (PinForm.tsx); auto-redirect se cookie válido
      contar/           ← BuscaClient com onSubmit=lancarSoloContagemCounter; cookie-gated
  (counter)/
    busca/              ← tela mobile busca + lançamento cego
    finalizacao/        ← contador finaliza contagem
    reconciliacao/      ← independente reconcilia (Realtime + Pallets, PR #23)
  api/
    sessao/[id]/export/ ← GET route que gera .xlsx (PR #27)
    solo/[id]/export/   ← GET route solo .xlsx (PR #43)
actions/
  auth.ts | contagem.ts | finalizacao.ts | inventario.ts | reconciliacao.ts | sessao.ts | combinacao.ts
  solo.ts               ← PR #43+#47: criarSoloSessao(title, access_pin?, counter_name?) | lancarSoloContagem (admin) | verificarSoloPin | lancarSoloContagemCounter (cookie) | encerrarSoloSessao
                           ↳ _saveSoloEntry: helper privado compartilhado por lancarSoloContagem + lancarSoloContagemCounter
                           ↳ reutiliza LancarContagemPayload + RPC convert_count — mesmo contrato de contagem.ts
lib/
  supabase-client.ts   ← exporta createClient() — browser (NÃO createBrowserClient!)
  supabase-server.ts   ← exporta createClient() — server
  supabase-admin.ts    ← exporta createAdminClient() — service_role
supabase/migrations/
  001_schema.sql | 002_functions.sql | 003_rls.sql | 004_finalized_at.sql
  010_remove_bin_from_finalize.sql  ← finalize sem bin_location (PR #22)
  011_combine_session.sql           ← RPC combine_session_results (PR #25)
  012_fix_count_entries_duplicates.sql ← UNIQUE INDEX + cleanup duplicatas (PR #26)
  013_finalize_c1_c2_only.sql       ← independente não finaliza (PR #32)
  015_independente_confirm.sql      ← independente_confirmed_at + RLS counter_accounts (PR #37)
  016_solo_sessions.sql             ← solo_sessions(title,status) + solo_entries + RLS admin-only (PR #43)
  017_tolerance.sql                 ← tolerance_g em count_sessions + lógica tolerância em finalize_team_count (PR #45)
  018_solo_pin.sql                  ← access_pin VARCHAR(4) + counter_name TEXT em solo_sessions (PR #47)
```

## Fluxo completo — Contagem Tripla
1. Admin cria sessão → define nº equipes e box_tare_g
2. Admin cria equipes → gera team_pin + user_pin → imprime cartões com QR
3. Contadores 1 e 2 contam → cegos, lançam via mobile
4. Independente **não conta** — vai direto para /monitor (tela ao vivo de C1 vs C2)
5. Admin finaliza equipe (quando C1+C2 finalizaram) → clica "Check →" → RPC `finalize_team_count` → compara C1 vs C2 → gera reconciliation_items
6. Independente reconcilia discrepâncias → valor acordado (normal: Pallets×pallet_size+Cases+Units; peso: nº caixas+peso bruto)
7. Admin monitora reconciliação ao vivo (Realtime)
8. Independente confirma → status 'reconciliada'
9. Admin acessa Combinação → confirma → RPC `combine_session_results` → `combined_results`
10. Admin exporta Excel → `/api/sessao/[id]/export` → .xlsx com aba por equipe + Consolidado

## Fluxo Solo Count (PR #43, admin-only)
1. Admin → Dashboard → Solo Count → New Solo Count (só pede título)
2. Abre `/admin/solo/[id]` que JÁ É a tela de contagem (SoloCountClient)
3. Busca client-side por código ou nome → clica item → form Pallets/Cases/Units (BPU=1 trava pallets/cases; pallet_size=0 trava pallets)
4. Submit → upsert `solo_entries` (recontar = substitui); lista ao vivo do que foi contado
5. Finalise Solo Count → encerra sessão
6. Export Excel → `/api/solo/[id]/export`: Category/Category1/BrandCode/BrandName/BPU/Cases/Units

## PRs mergeados
| PR | O que fez |
|----|----------|
| #1–#10 | Bootstrap, schema, upload, auth 2-PIN, layouts, routing, header |
| #11 | Tela mobile /busca — busca + lançamento cego |
| #12 | Finalização contador + monitoring admin com Realtime |
| #13 | Reconciliação de equipe (view estático) |
| #21 | **Realtime auth fix** no ProgressoClient (getSession → setAuth antes de subscribe) |
| #22 | Remove BIN do fluxo; admin layout max-w-7xl; tabela `10+21` com bordas |
| #23 | Realtime admin+counter reconciliação; Pallets no form; cartões impressão QR |
| #25 | Combinação de equipes: RPC combine_session_results + CombinacaoClient + ProgressoClient link |
| #26 | Fix bug peso: maybeSingle() com duplicatas → DELETE+INSERT + UNIQUE INDEX |
| #27 | Excel export: `/api/sessao/[id]/export` + botão "↓ Exportar Excel" na Combinação |
| #29 | Tela unificada: /progresso → redirect; CombinacaoClient absorve ProgressoClient (Realtime, chips, tabs, flash) |
| #30 | Inventory upload sync completo; pallet input disabled quando pallet_size=0; negativos bloqueados |
| #31 | Tradução completa para inglês britânico (26 arquivos) |
| #32 | Independente vira auditor: /monitor ao vivo; discrepância simplificada C1 vs C2; migration 013 |
| #33 | fix: allFin excluía independente → botão "Check →" nunca aparecia |
| #34 | C1/C2 veem lista de reconciliação read-only; Realtime ativo |
| #37 | Independente confirmation flow: independente_confirmed_at + MonitorClient banner + Check/Force buttons |
| #38 | (cancelado — conflito) |
| #39 | Force Close session + Delete Session com modal (deletar equipes?) em /admin/sessoes |
| #40 | fix: admin abre página antes de contadores submeterem → inventory sempre buscado no Promise.all |
| #41 | fix: live count table usa mesmo formato rico da reconciliada (Category/BrandCode/BPU + Cases/Units) |
| #42 | fix: BPU=1 → Pallets e Cases desabilitados no CountForm; apenas Units editável |
| #43 | feat: Solo Count admin-only (sem PIN, sem reconciliação); SoloCountClient reutiliza BuscaClient/CountForm com `onSubmit` injetado; `/admin/solo` + `/admin/solo/[id]` |
| #44 | fix: Excel export usa mesma lógica do `getMerged` (resolvido→reconciliation, else C1, não mais independente_cases que é NULL); feat: aba "Template Import Reconc" (Brand Code / Outer / Units / Status="Avl") |
| #45 | feat: campo tolerance_g no form `/admin/sessao`; migration 017 (tolerance_g em count_sessions + lógica CEIL no finalize_team_count) |

## PRs pendentes (open)
- **#46** — dead code cleanup (10 arquivos, 1471 linhas); `app/(admin)/` e componentes legados
- **#47** — solo count PIN access para contadores; `/solo/[id]` + `/solo/[id]/contar`; migration 018

## Pendências
1. **MonitorClient badges** — C1/C2 não atualizam em tempo real (aceitável por ora)

## O que FALTA (deferred)
1. **Auditoria final** — 2 auditores aprovam → tabela `audit_approvals`

## Armadilha crítica: TypeScript 5.7 + xlsx + BodyInit
- `XLSX.write(wb, { type: 'array' })` retorna `Uint8Array<ArrayBufferLike>`
- TS 5.7 tornou typed arrays genéricos → não é assignável a `BodyInit`
- Fix: `as unknown as BodyInit` no cast (runtime correto, apenas issue de tipagem)

## Workflow
- Todo código vai ao GitHub via MCP (`mcp__github__*`) — branch + push + PR
- Mergear com squash
- Push direto na main APENAS se o usuário disser explicitamente
- [[project-count-stock-architecture]] para padrões técnicos críticos
