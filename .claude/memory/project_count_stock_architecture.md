---
name: project-count-stock-architecture
description: "Count Stock — padrões técnicos: schema DB, Realtime auth, fórmulas de contagem, regra não-contado=0 no merge, armadilhas conhecidas"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-07-02
  originSessionId: cc63e5ca-5312-44b8-b967-5637df8cc275
---

# Count Stock — Arquitetura Técnica e Padrões

## Schema Supabase (tabelas principais)
```sql
count_sessions     — id, status ('aberta'|'encerrada'), box_tare_g INT, tolerance_g INT DEFAULT 0
teams              — id, session_id, team_name, team_pin (varchar 4, nullable), status
                     status: 'contando'|'finalizada'|'reconciliando'|'reconciliada'
counter_accounts   — auth_user_id, team_id, role, username (=team_pin+user_pin), user_pin
inventory_items    — brand_code (PK), brand_name, bpu, pallet_size, weight_avg, category, category1
count_entries      — team_id, brand_code, counter_role, final_cases/units, is_weight_count, is_joint_recount
reconciliation_items — team_id, brand_code, status ('combinado'|'discrepancia'|'resolvido'),
                       contador_1_cases/units, contador_2_cases/units,
                       independente_cases/units, reconciliated_cases/units, is_weight_count
combined_results   — session_id, brand_code, total_cases/units, contributing_teams JSONB, status ('Avl')
solo_sessions/solo_entries — modo solo (admin); colunas access_pin/counter_name ficaram só na branch #47 abandonada
audit_approvals    — (auditoria final, ainda não usada no fluxo)
```
Manter sempre: `inventory_items` e `item_bin_locations`. Produção foi resetada em 2026-07-02 (só admin + inventário).

## Clientes Supabase — QUAL usar onde
```
lib/supabase-client.ts  → createClient()        browser (client components)
lib/supabase-server.ts  → createClient()        server (server components, actions)
lib/supabase-admin.ts   → createAdminClient()   service_role (bypass RLS)
```
**ARMADILHA**: `lib/supabase-client.ts` exporta `createClient`, NÃO `createBrowserClient`. Errar quebra o build (Turbopack).

## Padrão Realtime (autenticação obrigatória)
Em client component: `supabase.auth.getSession()` → `supabase.realtime.setAuth(token)` **antes** do `.subscribe()`. Sem `setAuth`, conecta anon → RLS bloqueia → sem eventos.

## Fórmulas de contagem
### Normal: armazenado `final_cases = pallets×pallet_size + cases`; `final_units = units`.
### Peso (is_weight_count): `liquido = gross_weight_g - num_boxes×box_tare_g`; `units_total = liquido/weight_avg` (>=0.7 ceil, senão floor); `final_cases = floor(units_total/BPU)`; `final_units = units_total % BPU`.
### Tolerância peso no finalize (017): exact match primeiro; se `tolerance_g>0` e ambos peso e `weight_avg>0`, `v_tol_units = CEIL(tolerance_g/weight_avg)` → `ABS(c1-c2) <= v_tol_units` → combinado.

## Merge final — valor oficial por equipe e regra “não-contado=0”
- Valor oficial por item/equipe (`getMerged` na tela, `official()` no export, e a RPC): `status='resolvido'` → reconciliated; senão se `independente_cases` preenchido → independente (legado, hoje NULL); senão → contador_1 (C1=C2). Merge = soma em unidades entre equipes reconciliadas, renormaliza pelo BPU.
- **Regra não-contado=0 (PR #48)**: os 3 produtores iteram o **inventário inteiro**, não só códigos contados. Código sem contagem → merge `{0,0}`, sem coluna de equipe. 
  - `combine_session_results` (migration 019, APLICADA): loop externo `SELECT ii.brand_code, COALESCE(NULLIF(ii.bpu,0),1) FROM inventory_items ii` (o COALESCE/NULLIF evita divisão por zero em itens bpu 0/null).

## Formato de exibição
Sempre `cases+units` (ex: `10+21`). Sem labels. Em toda a UI.

## Convenções de código
- `bin_location` sempre NULL (removido no PR #22). `router.refresh()` após mutações + Realtime como reforço. RLS: contadores só veem seu team_id; admin usa service_role.

## Armadilhas conhecidas
1. `createBrowserClient` NÃO existe em `lib/supabase-client.ts` — usar `createClient`.
2. Realtime sem `setAuth(token)` → anon → RLS bloqueia.
3. `finalize_team_count` só para role admin; `confirmarReconciliacao`/`resolverItemReconciliacao` só para independente.
4. TS 5.7 + xlsx: `XLSX.write(...,{type:'array'})` → cast `as unknown as BodyInit`.
5. **GitHub MCP não faz patch de linha**: para arquivos grandes, clonar local + Edit cirúrgico e depois push (reproduzir arquivo inteiro à mão arrisca corromper). Git push local não tem credencial nesta máquina — usar `push_files` do MCP.
6. `next build` (ESLint) falha em **unused vars** (strict, mas sem noUnusedLocals no tsc — quem pega é o ESLint). Ao remover o único uso de uma var, remover a declaração.
7. **Preview e produção compartilham o mesmo Supabase**; migration NÃO é auto-aplicada no merge (aplicar via `apply_migration`).
8. **Solo-PIN login (#47) ABANDONADO**: bounce 307 em `/solo/[id]/contar` (cookie `solo_pin_<id>` ausente na requisição após login); causa não achada; set-cookie+redirect no servidor e set-cookie+nav client-side, nenhum resolveu. Não reabrir sem repensar.
