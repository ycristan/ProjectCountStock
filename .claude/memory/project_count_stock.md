---
name: project-count-stock
description: "Count Stock — contagem física cega tripla: stack, fluxo, PRs #1–#52 mergeados, #53 revertido, #54/#55/#57 mergeadas 2026-07-21; upload real de 504 itens testado em produção"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-07-21
  originSessionId: 38f8fef7-b858-4278-b0b6-f5beeac16c76
---

# Count Stock — Sistema de Contagem Cega Tripla

## Links de acesso
- **GitHub**: https://github.com/ycristan/ProjectCountStock (público)
- **Supabase projeto**: https://supabase.com/dashboard/project/sktpzvlmeegyuqsvtunx
- **Vercel dashboard**: https://vercel.com/ycristans-projects/project-count-stock-ylmm
- **App URL produção**: derivado do host do request em runtime (sem env var hardcoded)

## Estado atual (2026-07-21)
- **Banco resetado 2026-07-03**, inventário recarregado. **2026-07-21: usuário fez upload real de planilha com 504 itens** — confirmado via SQL direto: `inventory_items` = 504 `brand_active=true` + 1775 `brand_active=false` (nenhum deletado) = 2279 total (a mais que os 2246 anteriores — planilha trouxe brand_codes novos via upsert). Fix do #55 validado em produção real, não só sintético.
- Primeira contagem tripla real em produção rodou 2026-07-08 (1 dia vs ~10h+1 semana do processo manual anterior).
- Variável importante: **preview e produção usam o MESMO Supabase** (`sktpzvlmeegyuqsvtunx`). Não há banco por branch.
- **Migrations NÃO são aplicadas automaticamente no merge** — aplicar à mão via Supabase MCP `apply_migration`.
- Sessão agora encerra de verdade e revoga acesso de contador/independente após "Confirm merged results" (#54 + #57, ambas mergeadas e testadas — ver seção de bugs abaixo).

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

## Bug conhecido: upload de inventário crashava com FK (RESOLVIDO, PR #55, mergeada e testada em produção 2026-07-21)
- Qualquer `brand_code` já contado (FK de `count_entries`, `reconciliation_items`, `combined_results`, `item_bin_locations`) nunca pode ser deletado de `inventory_items` — o upload antigo tentava `DELETE` os códigos ausentes da planilha nova e sempre crashava após a primeira contagem real.
- Fix: coluna `inventory_items.brand_active BOOLEAN DEFAULT true` (migration `021_brand_active.sql`). `uploadInventory` (`actions/sessao.ts`) troca o delete por `UPDATE brand_active=false` nos ausentes; upsert seta `brand_active=true` nos presentes. Busca de contagem filtra `.eq('brand_active', true)` em `carregarInventario()` (equipe) e `app/admin/solo/[id]/page.tsx` (Solo).
- Planilha de upload **não muda de estrutura** — item ausente vira inativo automaticamente.
- Fora do escopo (intencional): badge visual / modal de confirmação de item inativo — é o item 4 do roadmap pós-contagem, não incluído aqui.
- **Validado em produção 2026-07-21**: upload real de 504 itens → 504 ativos + 1775 inativos, zero deletados, zero crash.

## Bug conhecido: guard de sessão fechada nunca disparava (RESOLVIDO, PR #57, mergeada 2026-07-21)
- `app/(counter)/layout.tsx` lia `(team?.count_sessions as {status:string}[])?.[0]?.status` — mas `teams.session_id` é FK única (`teams_session_id_fkey`), então o embed do PostgREST/supabase-js vem como **objeto singular**, não array. `?.[0]` num objeto é sempre `undefined` → `sessionClosed` nunca virava `true` → guard nunca disparava.
- Sintoma real reportado pelo usuário: sessão fechada, mas contador conseguia abrir a tela de contagem e só ao tentar salvar recebia o erro cru `new row violates row-level security policy for table "count_entries"` em vez da tela amigável "Count session closed".
- RLS bloqueou a escrita corretamente o tempo todo — nenhum dado incorreto foi salvo, só a UX estava quebrada.
- Fix: `(team?.count_sessions as {status:string}|null|undefined)?.status` (objeto direto, sem índice). Testado no preview antes do merge.

## Regra BPU=1
- `item.bpu === 1`: Pallets e Cases `disabled` no CountForm; só Units editável.

## Migrations (supabase/migrations) — até 021
001 schema | 002 functions | 003 rls | 004 finalized_at | 005 weight_avg | 006 category | 007 reconc_recount | 008 weight_marker | 009 realtime+admin_rls | 010 remove_bin_from_finalize | 011 combine_session | 012 fix_count_entries_dup | 013 finalize_c1_c2_only | 014 fix_combine_no_discrepancy | 015 independente_confirm | 016 solo_sessions | 017 tolerance | 018 solo_pin | 019 combine_all_inventory (item não contado=0) | **020 encerrar_sessao_combinacao** (combine_session_results seta status='fechada'; RLS bloqueia escrita pós-fechamento) | **021 brand_active** (inventory_items.brand_active)

## PRs
- Mergeados: #1–#52.
- **#53 (rebrand "NEXT CHAIN") mergeado 2026-07-06 SEM AUTORIZAÇÃO e revertido no mesmo dia** — não está em produção.
- **#54 (fecha sessão + guard "Count session closed") — mergeada 2026-07-21**, testada, autorização explícita do usuário.
- **#55 (brand_active no upload) — mergeada 2026-07-21**, testada em produção com upload real de 504 itens.
- **#57 (fix do guard do #54, que não disparava — bug de shape objeto vs array no embed PostgREST) — mergeada 2026-07-21**, testada no preview antes do merge.
- **#56 (recriação do #53 sobre a main atual, draft "não mergear") — OPEN**, serve só de base pro `/code-review`. Achado: rebrand só cobre 6 de ~40 arquivos, resto do app fica com Tailwind hardcoded antigo — diverge da preferência forte do usuário por padronização visual (ver `.claude/memory/feedback_reuse_components.md`).
- **Plano de rebrand completo (4 PRs) aprovado em conceito 2026-07-21, ainda não iniciado**: (A) infra — migrar tokens `--cs-*` de CSS vars soltas pra `@theme` do Tailwind 4 (hoje precisa de `style={{background:'var(--cs-x)'}}` inline em cada uso, por isso a adoção não pegou) + `<AppHeader>` compartilhado entre admin e counter (hoje duplicado); (B) aplicar em todo `app/admin/**` restante; (C) aplicar em todo `app/(counter)/**` (maior risco, usado ao vivo na contagem física); (D) seção "Design System" neste CLAUDE.md proibindo cor hardcoded daqui pra frente + checar se `app/(admin)/*` é rota morta duplicada.

## Lição: solo-PIN login (não repetir)
Tentativa: contador solo logar pela tela normal com codinome+PIN, cookie `solo_pin_<id>` pra cair em `/solo/[id]/contar`. Sintoma: login OK mas `GET /solo/[id]/contar` sempre voltava 307 pro login (cookie httpOnly não sobrevivia). 2 tentativas não resolveram, causa raiz nunca achada. PR #47 fechada sem merge. Se voltar: investigar o cookie ou repensar (ex.: contador solo como usuário Supabase real).

## Armadilha crítica: TypeScript 5.7 + xlsx + BodyInit
- `XLSX.write(wb,{type:'array'})` → `Uint8Array<ArrayBufferLike>` não assignável a `BodyInit`. Fix: `as unknown as BodyInit`.

## Workflow
- Todo código via GitHub MCP (`mcp__github__*`) — branch + PR + squash. Push direto na main só se o usuário pedir (docs/memory ok).
- Migration aplicada direto no Supabase (MCP `apply_migration`) mesmo antes do merge do PR — padrão já usado nas migrations 020 e 021.
- [[project-count-stock-architecture]] para padrões técnicos críticos.
- **Memória do projeto é espelhada em dois lugares: local (`~/.claude/.../memory/`) e neste repo (`.claude/memory/`). Sempre atualizar os dois juntos, nunca só um.**
