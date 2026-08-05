---
name: project-count-stock-architecture
description: "Count Stock — padrões técnicos: schema DB, clientes Supabase, Realtime auth, fórmulas de contagem, regra não-contado=0, e as armadilhas que já quebraram produção (proxy.ts, cap de 1000 linhas, soma aditiva)"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-08-05
  originSessionId: cc63e5ca-5312-44b8-b967-5637df8cc275
---

# Count Stock — Arquitetura Técnica e Padrões

## Schema Supabase (tabelas principais)
```sql
count_sessions     — id, status ('aberta'|'fechada'), box_tare_g INT, tolerance_g INT DEFAULT 0
teams              — id, session_id, team_name, team_pin (varchar 4, nullable), status
                     status: 'contando'|'finalizada'|'reconciliando'|'reconciliada'
counter_accounts   — auth_user_id, team_id, role, username (=team_pin+user_pin), user_pin
inventory_items    — brand_code (PK), brand_name, bpu, pallet_size, weight_avg, category, category1,
                     brand_active BOOLEAN DEFAULT true (migration 021 — soft-disable no upload)
count_entries      — team_id, brand_code, counter_role, final_cases/units, is_weight_count,
                     gross_weight_g, num_boxes, is_joint_recount
reconciliation_items — team_id, brand_code, status ('combinado'|'discrepancia'|'resolvido'),
                       contador_1_cases/units, contador_2_cases/units,
                       independente_cases/units, reconciliated_cases/units, is_weight_count
combined_results   — session_id, brand_code, total_cases/units, contributing_teams JSONB, status ('Avl')
solo_sessions      — id, title, status ('open'|'closed'), created_at,
                     access_pin VARCHAR(4) NULL, counter_name TEXT NULL (migration 018),
                     assigned_to_counter BOOL, restrict_to_list BOOL (migration 022)
solo_entries       — session_id, brand_code, brand_name, pallets, cases, units,
                     final_cases, final_units, is_weight_count, counted_at
solo_session_items — lista pré-selecionada de itens de uma sessão solo (migration 022)
app_settings       — singleton: notify_email, defaults de tara/tolerância (migrations 022/024)
audit_approvals    — auditoria final, ainda NÃO usada no fluxo
item_bin_locations — mantida; `bin_location` em si está sempre NULL desde o PR #22
```
- **Nunca deletar linhas de `inventory_items`** — é FK de `count_entries`, `reconciliation_items`, `combined_results` e `item_bin_locations`. Item que sai da planilha vira `brand_active=false` (ver PR #55).
- `access_pin` existe na main desde a migration 018, mas ficou **sem uso** (o fluxo de PIN por cookie do PR #47 foi abandonado). Já `counter_name` **é usado ativamente**: desde o PR #58 quem preenche é o próprio contador solo, não o admin.
- Produção foi resetada em **2026-07-03** (só admin + inventário); depois recebeu upload real de 504 itens em 2026-07-21.

## Clientes Supabase — QUAL usar onde
```
lib/supabase-client.ts  → createClient()        browser (client components, 'use client')
lib/supabase-server.ts  → createClient()        server (server components, actions)
lib/supabase-admin.ts   → createAdminClient()   service_role (bypass RLS, criar usuários)
```
**ARMADILHA**: `lib/supabase-client.ts` exporta `createClient`, NÃO `createBrowserClient`. Errar o nome quebra o build (Turbopack falha imediatamente).

## Padrão Realtime (autenticação obrigatória)
Em client component: `supabase.auth.getSession()` → `supabase.realtime.setAuth(token)` **antes** do `.subscribe()`. Sem `setAuth`, conecta como anon → RLS bloqueia → nenhum evento chega. Cleanup com `supabase.removeChannel(channel)`.
Nomes de canal em uso: `'reconciliacao-admin'`, `'reconciliacao-counter'`, `'progresso-live'`.

## Fórmulas de contagem
- **Normal**: `final_cases = pallets × pallet_size + cases`; `final_units = units`.
- **Peso** (`is_weight_count`): `liquido = gross_weight_g − num_boxes × box_tare_g`; `units_total = liquido / weight_avg` (decimal ≥ 0.7 → ceil, senão floor); `final_cases = floor(units_total / BPU)`; `final_units = units_total % BPU`.
- **Tolerância no finalize (migration 017)**: exact match é verificado PRIMEIRO; a tolerância só entra se `tolerance_g > 0` E ambos usaram modo peso E `weight_avg > 0`. `v_tol_units = CEIL(tolerance_g / weight_avg)` → `ABS(c1 − c2) <= v_tol_units` → combinado.
- **BPU=1**: Pallets e Cases ficam `disabled` no `CountForm`; só Units é editável.

## Merge final — valor oficial por equipe e regra "não-contado = 0"
- Valor oficial por item/equipe (`getMerged` na tela, `official()` no export, e a RPC): `status='resolvido'` → reconciliated; senão se `independente_cases` preenchido → independente (legado, hoje NULL); senão → contador_1 (C1=C2). Merge = soma em unidades entre equipes reconciliadas, renormalizando pelo BPU.
- **Regra não-contado=0 (PR #48, migration 019)**: os 3 produtores iteram o **inventário inteiro**, não só os códigos contados. Código sem contagem → `{0,0}` no merge, sem coluna de equipe. O loop usa `COALESCE(NULLIF(ii.bpu,0),1)` para evitar divisão por zero em itens com bpu 0/null.
- **Não se aplica à contagem solo**: `app/api/solo/[id]/export/route.ts` monta as linhas só a partir de `solo_entries` (itens efetivamente contados); ali o inventário é apenas lookup.

## Formato de exibição
Sempre `cases+units` (ex.: `10+21`). Sem rótulos ("cx", "un"). Em toda a UI, sem exceção.

## Convenções de código
- `router.refresh()` após mutações, com Realtime como reforço.
- RLS: contadores só enxergam o próprio `team_id`; o admin passa por service_role.
- `bin_location` sempre NULL (removido do fluxo no PR #22).

## Armadilhas conhecidas

1. `createBrowserClient` NÃO existe em `lib/supabase-client.ts` — usar `createClient`.
2. Realtime sem `setAuth(token)` → conecta anon → RLS bloqueia → sem eventos.
3. `finalize_team_count` só funciona para role `admin`; `confirmarReconciliacao` e `resolverItemReconciliacao` só para `independente`.
4. **TS 5.7 + xlsx**: `XLSX.write(wb,{type:'array'})` devolve `Uint8Array<ArrayBufferLike>`, que o TS 5.7 não aceita como `BodyInit`. Fix: `as unknown as BodyInit` (runtime sempre esteve correto, é só tipagem).
5. **GitHub MCP não faz patch de linha**: em arquivo grande, reproduzir o conteúdo inteiro à mão arrisca corromper. Preferir clonar local + Edit cirúrgico + push, quando houver checkout. O MCP também **não tem tool de deletar arquivo nem branch** (confirmado por varredura das 24 tools) — arquivos aposentados viram stub `export {}`.
6. `next build` falha em **unused vars** (ESLint, não o tsc). Ao remover o último uso de uma variável, remover também a declaração.
7. **NUNCA apagar `proxy.ts` (raiz do projeto)**: é o middleware de auth do Next 16, carregado por convenção — **não aparece em nenhum grep de imports**. O PR #46 (limpeza de dead code) apagou e causou loop infinito de login em produção; revertido em 2026-07-03 (commit `b7d17aa`). Qualquer varredura de dead code precisa excluir esse arquivo.
8. **`PostgREST` tem teto de "Max Rows" (1000) que `.range(0, N)` NÃO contorna.** O `.range()` só declara a janela pedida pelo cliente; o servidor aplica o próprio teto por cima e devolve o menor dos dois. Sintoma enganoso: parecia "equipe não contou nada" e "nome de item corrompido", quando na verdade eram linhas cortadas — os dados sempre estiveram certos no banco.
   - **Fix correto**: paginar em loop até a página vir mais curta que o tamanho pedido. Helper: `lib/fetch-all-rows.ts` → `fetchAllRows()`.
   - **Sempre usar `fetchAllRows()` em qualquer select novo** em `inventory_items`, `item_bin_locations`, `count_entries`, `reconciliation_items` ou `solo_entries`. Nunca um select solto nessas tabelas.
   - **Armadilha de tipagem**: o parâmetro precisa aceitar `PromiseLike<...>`, não `Promise<...>` — o query builder do supabase-js é thenable mas não é Promise real (sem `.catch`/`.finally`), e usar `Promise<...>` quebra o build.
9. **Estado client-side que alimenta cálculo incremental precisa guardar o valor real salvo, não um booleano "já contado".** Bug crítico de 2026-07-03 (PR #51): "+ Add to Count" repetido no mesmo item **sobrescrevia em vez de somar**, porque `BuscaClient` só marcava um flag e cada nova adição partia do snapshot da carga da página. Fix: `CountForm` reporta o `{pallets,cases,units}` exato salvo e o `BuscaClient` guarda num mapa `entryOverrides` por `brand_code`.
10. **Embed de FK única volta como objeto, não array.** `teams.session_id` é FK única, então `team?.count_sessions` vem como objeto singular do PostgREST/supabase-js. O código lia `?.[0]?.status` (sempre `undefined`) e o guard de sessão fechada nunca disparava (PR #57). RLS protegeu os dados o tempo todo; só a UX quebrou.
11. **Migration NÃO é aplicada automaticamente no merge do PR** — aplicar à mão via Supabase MCP `apply_migration`. Padrão do projeto: aplicar durante o desenvolvimento, antes mesmo do merge.
12. **Preview e produção usam o MESMO banco Supabase** (`sktpzvlmeegyuqsvtunx`). Não existe banco isolado por branch — cuidado redobrado ao testar mudanças de RLS ou de status de sessão.
13. **Env var na Vercel precisa dos dois escopos**: Production **e** Preview. Var criada só em Production faz a branch de preview falhar silenciosamente. Observado neste projeto: vars marcadas como "sensitive" não puderam ter o escopo editado depois de criadas — só deu para criar entradas novas.
14. **Solo-PIN login (#47) ABANDONADO**: bounce 307 em `/solo/[id]/contar`, o cookie `solo_pin_<id>` não sobrevivia à requisição. Duas abordagens tentadas (set-cookie+redirect no servidor, set-cookie+navegação client-side), causa raiz nunca encontrada. O PR #58 resolveu solo count com **conta fixa** (login normal 2-PIN) e não teve o problema. Não reabrir a abordagem de cookie sem repensar do zero.
15. **Duas rotas parecidas**: `app/(admin)/sessao/page.tsx` → `/sessao` e `app/admin/sessao/page.tsx` → `/admin/sessao` (essa é a que o usuário acessa). Confirmar qual arquivo serve a rota antes de editar.
16. PowerShell 5.1 + Excel COM dá `InvalidCastException` com Double — usar `xlsx` (já instalado) ou openpyxl.

## Técnica: teste massivo simulado
Para testar reconciliação/merge em escala (N equipes, X% de cobertura) sem clicar milhares de vezes na UI: gerar `count_entries` direto via SQL (Supabase MCP `execute_sql`, que bypassa RLS) e rodar as **RPCs reais** do banco (`finalize_team_count`, `combine_session_results`). Isso testa a lógica de negócio de verdade, pulando só a camada de auth/UI.
- Pseudo-aleatoriedade determinística: `hashtext(brand_code || team_name || 'sal')` em vez de `random()` — reproduzível entre chamadas separadas, sem precisar de `setseed()`.
- Discrepância proposital: `disc_roll = hashtext(...) % 100`, ex. `< 75` combina e o resto diverge — dá controle exato da taxa para exercitar a reconciliação.
- Para testar `tolerance_g`: gerar 3 buckets — diff=0, diff=`tol_units` exato (deve combinar, testa o `<=` inclusivo) e diff=`tol_units`+extra (deve virar discrepância).
- Resolver discrepância = simular o independente: `UPDATE reconciliation_items SET reconciliated_cases=contador_1_cases, ..., status='resolvido'`.
- **Foi esse processo que revelou a armadilha 8** (cap de 1000 linhas na tela de Combinação): só apareceu com volume real, 5 equipes × ~2000 itens. Nunca teria sido pego com poucos itens de teste manual.
- Sempre criar sessão de teste **separada** da real, nunca misturar; apagar com `DELETE FROM count_sessions WHERE id=...` (cascade cuida do resto) ao terminar.
