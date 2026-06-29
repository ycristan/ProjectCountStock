---
name: project-count-stock-architecture
description: "Count Stock — padrões técnicos críticos: schema DB, Realtime auth, conversões de contagem, convenções de código e armadilhas conhecidas"
metadata:
  type: project
  originSessionId: 30e6d838-8f3e-4fe9-93ee-1594f3d6dd51
  updatedOn: 2026-06-29
---

# Count Stock — Arquitetura Técnica e Padrões

## Schema Supabase (tabelas principais)

```sql
count_sessions     — id, status ('aberta'|'encerrada'), box_tare_g (int, tara padrão g)
teams              — id, session_id, team_name, team_pin (varchar 4), status
                     status: 'contando' | 'finalizada' | 'reconciliando' | 'reconciliada'
counter_accounts   — auth_user_id, team_id, role, username, user_pin (varchar 4)
inventory_items    — brand_code (PK), brand_name, bpu, pallet_size, weight_avg, category, category1
item_bin_locations — brand_code, bin_location (informativo apenas, não usado na contagem)
count_entries      — id, team_id, brand_code, bin_location (NULL desde PR #22),
                     counter_role, final_cases, final_units, is_weight_count,
                     gross_weight_g, num_boxes
reconciliation_items — id, team_id, brand_code, bin_location (NULL),
                       status ('combinado'|'discrepancia'|'resolvido'),
                       contador_1_cases/units, contador_2_cases/units,
                       independente_cases/units, reconciliated_cases/units,
                       is_weight_count
```

## Clientes Supabase — QUAL usar onde
```
lib/supabase-client.ts  → createClient()        browser (client components, 'use client')
lib/supabase-server.ts  → createClient()        server (server components, actions)
lib/supabase-admin.ts   → createAdminClient()   service_role (bypass RLS, criar usuários)
```

**ARMADILHA**: `lib/supabase-client.ts` exporta `createClient`, NÃO `createBrowserClient`.
O `createBrowserClient` existe só internamente vindo de `@supabase/ssr`. Errar o nome quebra o build (Turbopack falha na hora).

## Padrão Realtime (autenticação obrigatória)
Sempre que criar um canal Realtime em client component:
```typescript
useEffect(() => {
  const supabase = createClient()               // lib/supabase-client
  let channel: ReturnType<typeof supabase.channel> | null = null
  supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token
    if (!token) return
    supabase.realtime.setAuth(token)            // OBRIGATÓRIO antes de subscribe
    channel = supabase
      .channel('nome-unico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xxx', filter: `col=eq.${id}` },
        () => router.refresh())
      .subscribe()
  })
  return () => { if (channel) supabase.removeChannel(channel) }
}, [router])
```
**Por quê**: `createBrowserClient()` de `@supabase/ssr` conecta como anon antes do JWT ser carregado → RLS falha → sem eventos. Fix: aguardar `getSession()` e chamar `setAuth(token)`.

## Fórmulas de contagem

### Contagem normal
```
final_units_total = pallets × pallet_size + cases × BPU + units
  mas na entrada o usuário informa: pallets, cases (restantes), units (restantes)
  armazenado como: final_cases = pallets × pallet_size + cases
                   final_units = units
```
Na reconciliação normal, o form tem **Pallets × Cases + Units** e converte:
```typescript
reconciliated_cases = pallets * item.pallet_size + cases
reconciliated_units = units
```

### Contagem por peso (is_weight_count = true)
```
tara = num_boxes × box_tare_g
liquido = gross_weight_g - tara
units_total = liquido / weight_avg
arredondamento: decimal >= 0.7 → Math.ceil, senão Math.floor
final_cases = Math.floor(units_total / BPU)
final_units = units_total % BPU
```

### Tolerância de peso no finalize_team_count
Se todos 3 contadores usaram peso: `GREATEST - LEAST <= 200g` → combinado, senão discrepância.

## Formato de exibição de valores
Sempre `cases+units` (ex: `10+21`). **Sem labels** (sem "cx", sem "un"). Aplicado em toda a UI.

## finalize_team_count RPC (migration 010)
- Agrupa por `brand_code` APENAS (bin_location foi removido no PR #22)
- INSERT em `reconciliation_items` com `bin_location = NULL`
- Acessa contagens dos 3 roles: `contador_1`, `contador_2`, `independente`
- Calcula combinado/discrepancia por item

## Cartões de impressão (PR #23)
- Rota: `/admin/sessao/[id]/imprimir`
- Server component — gera SVG do QR com `qrcode` package (sem request externo)
- URL do QR = URL do app derivada do header `host` do request
- Formato cartão: team name → 3 cards (C1/C2/Independente) com PIN Equipe + PIN Pessoal + QR
- Print CSS: `@page { size: A4; margin: 1.5cm }`, `break-after: page` entre equipes

## Exportação Excel — formato definido (não implementado ainda)
Baseado no arquivo de referência `valores de contagens.xlsx`:
- Uma aba por equipe com colunas: Brand Category | Brand Category 1 | Brand Code | Brand Name | BPU | Cnt1 Cases | Cnt1 Units | Cnt2 Cases | Cnt2 Units | Ind Cases | Ind Units | Reconciliation Cases | Reconciliation Units | Final Count Cases | Final Count Units
- Aba "Consolidado": todas equipes side-by-side + coluna Merged Count (azul)
- Merged Count: `total_un = Σ(final_cases × BPU + final_units)` entre equipes; `merged_cases = FLOOR(total_un / BPU)`, `merged_units = total_un MOD BPU`
- N equipes dinâmico

## Convenções de código
- Formato valores: `${cases}+${units}` (sem labels)
- Sem bin_location em nenhum fluxo de contagem ou reconciliação
- `router.refresh()` para sincronizar dados após mutações + Realtime como reforço
- RLS: contadores só vêem dados do próprio team_id; admin usa service_role client
- Nomes de channel Realtime: `'reconciliacao-admin'`, `'reconciliacao-counter'`, `'progresso-live'`

## Armadilhas conhecidas
1. `createBrowserClient` não existe no export de `lib/supabase-client.ts` — use `createClient`
2. Realtime sem `setAuth(token)` → conexão anon → RLS bloqueia → sem eventos
3. `finalize_team_count` só funciona para role `admin` — verificar role antes de chamar
4. `confirmarReconciliacao` só para role `independente`
5. `resolverItemReconciliacao` só para role `independente`
6. PowerShell 5.1 + Excel COM tem `InvalidCastException` com Double → usar Python openpyxl para geração de XLSX
7. `bin_location` foi removido do fluxo de contagem (PR #22) — sempre NULL nas novas entradas
