---
name: project-count-stock
description: "Count Stock — contagem física cega tripla: stack, fluxo, PRs #1–#52 mergeados, #53 revertido; #54/#55 abertas 2026-07-17; banco resetado 2026-07-03 (2246 itens, 2 admins)"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-07-17
  originSessionId: 5ad9ffd3-5ec7-4148-8e6f-9f34f8098dd6
---

# Count Stock — Sistema de Contagem Cega Tripla

## Links de acesso
- **GitHub**: https://github.com/ycristan/ProjectCountStock (público)
- **Supabase projeto**: https://supabase.com/dashboard/project/sktpzvlmeegyuqsvtunx
- **Vercel dashboard**: https://vercel.com/ycristans-projects/project-count-stock-ylmm
- **App URL produção**: derivado do host do request em runtime (sem env var hardcoded)

## Estado atual (2026-07-17)
- **Banco resetado 2026-07-03**: 0 sessões/equipes, inventário recarregado (2246 itens, auditado sem duplicatas/dados faltando), 2 admins ativos.
- Primeira contagem tripla real em produção rodou 2026-07-08 (1 dia vs ~10h+1 semana do processo manual anterior).
- Variável importante: **preview e produção usam o MESMO Supabase** (`sktpzvlmeegyuqsvtunx`). Não há banco por branch.
- **Migrations NÃO são aplicadas automaticamente no merge** — aplicar à mão via Supabase MCP `apply_migration`.

## Stack
- Next.js 16.2.9 + React 19 + TypeScript (strict)
- Tailwind CSS 4 + `@tailwindcss/postcss`
- Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/ssr`
- `xlsx` — upload/download de inventário e exportação Excel
- `qrcode` — QR codes server-side (PR #23)

## Auth — padrão 2-PIN (contadores triplos)
- Email Supabase: `${team_pin}${user_pin}@count.local`; Senha: `user_pin` (4 dígitos)
- `user_metadata.role`: `'admin'` ou `'counter'`; `counter_role`: `'contador_1'|'contador_2'|'independente'`; `team_id`
- Nomes reais dos contadores: NÃO em `counter_accounts.username` (guarda `team_pin+user_pin`) — estão em `auth.users.raw_user_meta_data->>'full_name'`

## Solo Count
- **Modo Admin (PR #43)**: contagem pelo próprio admin, sem PIN, sem reconciliação. `/admin/solo` → New → `/admin/solo/[id]` (SoloCountClient reusa BuscaClient/CountForm) → Finalise → Export.
- **Modo Contador com PIN (PR #47) — FECHADA/ABANDONADA 2026-07-02** (bounce 307 no cookie httpOnly, causa raiz nunca achada). `/solo/[id]` **nunca foi mergeado ao main** — não existe hoje. Não reabrir sem repensar do zero.

## Fluxo completo — Contagem Tripla
1. Admin cria sessão (nº equipes, box_tare_g, tolerance_g). 2. Cria equipes (team_pin+user_pin, cartões QR). 3. Contadores 1 e 2 contam cego. 4. Independente **não conta** — vai pra /monitor. 5. Admin "Check →" → RPC `finalize_team_count` → gera reconciliation_items. 6. Independente reconcilia discrepâncias. 7. Admin monitora ao vivo. 8. Independente confirma → status 'reconciliada'. 9. Admin → Combinação → Confirm Merge → RPC `combine_session_results` → `combined_results` + `count_sessions.status='fechada'`. 10. Export Excel.

## Bug conhecido: sessão travada em status='aberta' (RESOLVIDO por sessão, ver abaixo)
- `combine_session_results` só passou a setar `count_sessions.status='fechada'` a partir da migration 020 (2026-07-09).
- `app/admin/sessao/[id]/combinacao/page.tsx` calcula `isConfirmed = (combined_results.length > 0)`; assim que `true`, `CombinacaoClient.tsx` **esconde o botão "Confirm Merge →" para sempre** e mostra só texto estático. Ou seja: sessão que mergeou ANTES da migration 020 fica travada em 'aberta' **sem nenhum caminho de UI** para corrigir.
- Fix pontual: rodar `select combine_session_results('<session_id>')` direto via SQL (Supabase MCP `execute_sql`) — é a função de produção real, idempotente, mesmo efeito do botão. Feito 2026-07-17 nas 2 sessões afetadas (03/07 e 09/07 07:37).
- Se aparecer de novo numa sessão pré-020: mesma solução via SQL, nunca pela UI.

## Bug conhecido: upload de inventário crashava com FK (RESOLVIDO, PR #55)
- Qualquer `brand_code` já contado (FK de `count_entries`, `reconciliation_items`, `combined_results`, `item_bin_locations`) nunca pode ser deletado de `inventory_items` — o upload antigo tentava `DELETE` os códigos ausentes da planilha nova e sempre crashava após a primeira contagem real.
- Fix: coluna `inventory_items.brand_active BOOLEAN DEFAULT true` (migration `021_brand_active.sql`). `uploadInventory` (`actions/sessao.ts`) troca o delete por `UPDATE brand_active=false` nos ausentes; upsert seta `brand_active=true` nos presentes. Busca de contagem filtra `.eq('brand_active', true)` em `carregarInventario()` (equipe) e `app/admin/solo/[id]/page.tsx` (Solo).
- Planilha de upload **não muda de estrutura** — item ausente vira inativo automaticamente.
- Fora do escopo (intencional): badge visual / modal de confirmação de item inativo — é o item 4 do roadmap pós-contagem, não incluído aqui.

## Regra BPU=1
- `item.bpu === 1`: Pallets e Cases `disabled` no CountForm; só Units editável.

## Migrations (supabase/migrations) — até 021
001 schema | 002 functions | 003 rls | 004 finalized_at | 005 weight_avg | 006 category | 007 reconc_recount | 008 weight_marker | 009 realtime+admin_rls | 010 remove_bin_from_finalize | 011 combine_session | 012 fix_count_entries_dup | 013 finalize_c1_c2_only | 014 fix_combine_no_discrepancy | 015 independente_confirm | 016 solo_sessions | 017 tolerance | 018 solo_pin | 019 combine_all_inventory (item não contado=0) | **020 encerrar_sessao_combinacao** (combine_session_results seta status='fechada'; RLS bloqueia escrita pós-fechamento) | **021 brand_active** (inventory_items.brand_active)

## PRs
- Mergeados: #1–#52.
- **#53 (rebrand "NEXT CHAIN") mergeado 2026-07-06 SEM AUTORIZAÇÃO e revertido no mesmo dia** — não está em produção.
- **#54 (fecha sessão + guard "Count session closed" pra C1/C2/independente) — OPEN**, SQL (migration 020) já em produção, falta testar guard de UI + aprovação de merge.
- **#55 (brand_active no upload) — OPEN** 2026-07-17, migration 021 já em produção, falta testar upload + aprovação de merge.

## Lição: solo-PIN login (não repetir)
Tentativa: contador solo logar pela tela normal com codinome+PIN, cookie `solo_pin_<id>` pra cair em `/solo/[id]/contar`. Sintoma: login OK mas `GET /solo/[id]/contar` sempre voltava 307 pro login (cookie httpOnly não sobrevivia). 2 tentativas não resolveram, causa raiz nunca achada. PR #47 fechada sem merge. Se voltar: investigar o cookie ou repensar (ex.: contador solo como usuário Supabase real).

## Armadilha crítica: TypeScript 5.7 + xlsx + BodyInit
- `XLSX.write(wb,{type:'array'})` → `Uint8Array<ArrayBufferLike>` não assignável a `BodyInit`. Fix: `as unknown as BodyInit`.

## Workflow
- Todo código via GitHub MCP (`mcp__github__*`) — branch + PR + squash. Push direto na main só se o usuário pedir (docs/memory ok).
- Migration aplicada direto no Supabase (MCP `apply_migration`) mesmo antes do merge do PR — padrão já usado nas migrations 020 e 021.
- [[project-count-stock-architecture]] para padrões técnicos críticos.
- **Memória do projeto é espelhada em dois lugares: local (`~/.claude/.../memory/`) e neste repo (`.claude/memory/`). Sempre atualizar os dois juntos, nunca só um.**
