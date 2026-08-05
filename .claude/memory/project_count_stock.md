---
name: project-count-stock
description: "Count Stock — contagem física cega tripla: stack, fluxo, PRs #1–#52 mergeados, #53 revertido, #54/#55/#57 mergeadas 2026-07-21; PR #58 (contador solo fixo) mergeado 2026-08-05"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-08-05
  originSessionId: 38f8fef7-b858-4278-b0b6-f5beeac16c76
---

# Count Stock — Sistema de Contagem Cega Tripla

## Links de acesso
- **GitHub**: https://github.com/ycristan/ProjectCountStock (público)
- **Supabase projeto**: https://supabase.com/dashboard/project/sktpzvlmeegyuqsvtunx
- **Vercel dashboard**: https://vercel.com/ycristans-projects/project-count-stock-ylmm
- **App URL produção**: derivado do host do request em runtime (sem env var hardcoded)

## Estado atual (2026-08-05)
- **PR #58 (contador solo fixo) mergeado na main** (squash, commit `fe65d0b7`) — ver seção própria abaixo.
- Banco resetado 2026-07-03, inventário recarregado; upload real de 504 itens testado 2026-07-21 (ver bug conhecido abaixo).
- Variável importante: **preview e produção usam o MESMO Supabase** (`sktpzvlmeegyuqsvtunx`). Não há banco por branch.
- **Migrations NÃO são aplicadas automaticamente no merge** — aplicar à mão via Supabase MCP `apply_migration` (mas no caso do #58, todas as migrations 022-025 já tinham sido aplicadas ao longo do desenvolvimento, antes mesmo do merge).
- Sessão agora encerra de verdade e revoga acesso de contador/independente após "Confirm merged results" (#54 + #57, ambas mergeadas e testadas — ver seção de bugs abaixo).

## Stack
- Next.js 16.2.9 + React 19 + TypeScript (strict)
- Tailwind CSS 4 + `@tailwindcss/postcss`
- Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/ssr`
- `xlsx` — upload/download de inventário e exportação Excel
- `qrcode` — QR codes server-side (PR #23)
- `EmailJS` (REST API via `fetch`, sem SDK) — notificação de resultado de contagem solo. Substituiu `resend` (removido do package.json) porque o Resend só permite enviar pro e-mail dono da conta sem domínio verificado, e o usuário não tem acesso DNS ao domínio da empresa.

## Auth — padrão 2-PIN (contadores triplos)
- Email Supabase: `${team_pin}${user_pin}@count.local`; Senha: `user_pin` (4 dígitos)
- `user_metadata.role`: `'admin'` ou `'counter'`; `counter_role`: `'contador_1'|'contador_2'|'independente'`; `team_id`
- Nomes reais dos contadores: NÃO em `counter_accounts.username` (guarda `team_pin+user_pin`) — estão em `auth.users.raw_user_meta_data->>'full_name'`

## Solo Count (pós-#58)
- **Contador solo fixo**: 1 conta compartilhada `90000001@count.local` (team_pin `9000` + user_pin `0001`), `user_metadata: {role:'counter', is_solo_counter:true}`. Cada pessoa que usa a conta digita o próprio nome na primeira sessão que abre (`counter_name`, first-write-wins).
- **Admin atribui sessão** ao contador fixo (em vez de contar ele mesmo) via wizard `/admin/sessao/solo`, opcionalmente restringindo a uma lista pré-selecionada de itens (`solo_session_items`).
- **`/admin/settings`**: hub central — tara/tolerância default, e-mail de notificação, criar/deletar a conta do contador solo fixo.
- Rotas: `/admin/solo` (lista admin) espelha `/solo` (lista contador); ambas reusam `BuscaClient`/`CountForm` sem modificação.
- **Modo Admin puro (PR #43)** continua existindo: admin conta ele mesmo, sem atribuir a ninguém.
- **PR #47 (PIN por cookie httpOnly) permanece abandonada** — nunca foi reaproveitada, #58 é implementação nova do zero.

## Fluxo completo — Contagem Tripla
1. Admin cria sessão (nº equipes, box_tare_g, tolerance_g — agora com default vindo de `/admin/settings`). 2. Cria equipes (team_pin+user_pin, cartões QR). 3. Contadores 1 e 2 contam cego. 4. Independente **não conta** — vai pra /monitor. 5. Admin "Check →" → RPC `finalize_team_count` → gera reconciliation_items. 6. Independente reconcilia discrepâncias. 7. Admin monitora ao vivo. 8. Independente confirma → status 'reconciliada'. 9. Admin → Combinação → Confirm Merge → RPC `combine_session_results` → `combined_results` + `count_sessions.status='fechada'`. 10. Export Excel.

## PR #58 — Contador Solo Fixo (mergeado 2026-08-05)
Pedido original: 1 conta fixa de contador solo, admin atribui sessão + restringe lista de itens, envia resultado por e-mail ao finalizar.

**O que entrou** (2 rodadas de desenvolvimento, 2026-07-30 a 2026-08-05):
- Conta fixa + atribuição + lista restrita + e-mail de resultado (1ª rodada)
- Tela `/admin/settings`, wizard de criação de sessão solo, fix de bug real (`box_tare_g` hardcoded em 300 em vez da tara real da sessão), cleanup de `/admin/solo` (2ª rodada, migrations 024-025)

**Bugs achados no walkthrough manual e corrigidos antes do merge**:
1. Texto desatualizado no card "Solo Count" do dashboard (não era link morto, só texto — corrigido)
2. "Lista restrita não funciona" — na real o enforcement no servidor sempre funcionou (confirmado via SQL direto: zero itens fora da lista nas sessões de teste); o bug real era a UI do contador nunca mostrar a lista (só um campo de busca vazio, sem indicar o que buscar). Fix: `restrictToList` prop até o `BuscaClient`, mostra a lista completa direto quando restrito.
3. Migration 025: policies RLS do contador solo (022/023) não checavam `status='open'`, mesmo padrão do incidente #54 — corrigido por defesa em profundidade (achado pelo `/code-review`, não explorável hoje pois toda escrita usa service-role).
4. **E-mail via Resend nunca funcionou** — sandbox `onboarding@resend.dev` só entrega pro e-mail dono da conta Resend, sem domínio verificado (usuário não tem DNS do domínio da empresa). **Trocado para EmailJS** — manda através de Gmail real conectado via OAuth, sem restrição de destinatário.

**EmailJS — sequência de debug até funcionar** (3 erros distintos, cada um resolvido em ordem via log real da Vercel, não suposição):
1. "env vars not fully configured" → faltava marcar ambiente **Preview** nas env vars (só tinham Production)
2. "403 API access from non-browser environments is currently disabled" → habilitar em dashboard.emailjs.com/admin/account/security
3. "422 The recipients address is empty" → campo **To Email** do template (aba Settings, não a do HTML) precisa ser `{{to_email}}`

Env vars: `EMAILJS_SERVICE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `COUNTSTOCK_TEMPLATE_ID` (nome não-padrão, não `EMAILJS_TEMPLATE_ID` — código lê esse nome específico).

**Pendências pós-merge**:
1. Confirmar se o e-mail está saindo de fato (reteste do usuário ficou no erro #3, sem confirmação final antes do merge)
2. `notify_email` em `app_settings` está com `ycristan@gmail.com` (valor de teste) — trocar pra `yuridelima@vending.ie` quando confirmado
3. Branch `feat/solo-counter-fixed` pode ser deletado

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

## Migrations (supabase/migrations) — até 025
001 schema | 002 functions | 003 rls | 004 finalized_at | 005 weight_avg | 006 category | 007 reconc_recount | 008 weight_marker | 009 realtime+admin_rls | 010 remove_bin_from_finalize | 011 combine_session | 012 fix_count_entries_dup | 013 finalize_c1_c2_only | 014 fix_combine_no_discrepancy | 015 independente_confirm | 016 solo_sessions | 017 tolerance | 018 solo_pin | 019 combine_all_inventory (item não contado=0) | 020 encerrar_sessao_combinacao (combine_session_results seta status='fechada'; RLS bloqueia escrita pós-fechamento) | 021 brand_active (inventory_items.brand_active) | **022 solo_counter_fixed** (assigned_to_counter/restrict_to_list, solo_session_items, app_settings) | **023 solo_counter_rls_hardening** (WITH CHECK explícito, GRANT UPDATE coluna) | **024 system_settings_and_solo_tare** (box_tare_g por sessão, defaults) | **025 solo_counter_status_guard** (RLS checa status='open', achado pelo `/code-review`)

## PRs
- Mergeados: #1–#52, #54, #55, #57, **#58**.
- **#53 (rebrand "NEXT CHAIN") mergeado 2026-07-06 SEM AUTORIZAÇÃO e revertido no mesmo dia** — não está em produção.
- **#56 (recriação do #53 sobre a main atual, draft "não mergear") — ainda OPEN**, serve só de base pro `/code-review`. Achado: rebrand só cobre 6 de ~40 arquivos, resto do app fica com Tailwind hardcoded antigo — diverge da preferência forte do usuário por padronização visual (ver `.claude/memory/feedback_reuse_components.md`).
- **Plano de rebrand completo (4 PRs) aprovado em conceito 2026-07-21, ainda não iniciado**.
- **#58 (contador solo fixo) mergeado 2026-08-05** — ver seção própria acima.

## Lição: solo-PIN login (não repetir)
Tentativa: contador solo logar pela tela normal com codinome+PIN, cookie `solo_pin_<id>` pra cair em `/solo/[id]/contar`. Sintoma: login OK mas `GET /solo/[id]/contar` sempre voltava 307 pro login (cookie httpOnly não sobrevivia). 2 tentativas não resolveram, causa raiz nunca achada. PR #47 fechada sem merge. #58 implementou solo count com conta fixa (não PIN por cookie) e não teve esse problema.

## Armadilha crítica: TypeScript 5.7 + xlsx + BodyInit
- `XLSX.write(wb,{type:'array'})` → `Uint8Array<ArrayBufferLike>` não assignável a `BodyInit`. Fix: `as unknown as BodyInit`.

## Workflow
- Todo código via GitHub MCP (`mcp__github__*`) — branch + PR + squash. Push direto na main só se o usuário pedir (docs/memory ok).
- Migration aplicada direto no Supabase (MCP `apply_migration`) mesmo antes do merge do PR — padrão já usado nas migrations 020, 021, e 022-025.
- Ao pedir env var pro usuário configurar: repetir SEMPRE nome exato + todos os ambientes (Production E Preview) em cada uma, nunca abreviar depois da primeira.
- [[project-count-stock-architecture]] para padrões técnicos críticos.
- **Memória do projeto é espelhada em dois lugares: local (`~/.claude/.../memory/`) e neste repo (`.claude/memory/`). Sempre atualizar os dois juntos, nunca só um.**
