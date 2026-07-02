---
name: project-count-stock-architecture
description: "Count Stock — padrões técnicos críticos: schema DB, Realtime auth, fórmulas de contagem, convenções e armadilhas conhecidas"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-07-02
  originSessionId: cc63e5ca-5312-44b8-b967-5637df8cc275
---

# Count Stock — Arquitetura Técnica e Padrões

## Schema Supabase (tabelas principais)
```sql
count_sessions     — id, status ('aberta'|'encerrada'), box_tare_g (int, tara padrão g),
                     tolerance_g INT DEFAULT 0 (migration 017 — tolerância peso no finalize_team_count)
teams              — id, session_id, team_name, team_pin (varchar 4), status
                     status: 'contando'|'finalizada'|'reconciliando'|'reconciliada'
counter_accounts   — auth_user_id, team_id, role, username, user_pin (varchar 4)
inventory_items    — brand_code (PK), brand_name, bpu, pallet_size, weight_avg, category, category1
count_entries      — id, team_id, brand_code, bin_location (NULL desde PR #22),
                     counter_role, final_cases, final_units, is_weight_count,
                     gross_weight_g, num_boxes
reconciliation_items — id, team_id, brand_code, bin_location (NULL),
                       status ('combinado'|'discrepancia'|'resolvido'),
                       contador_1_cases/units, contador_2_cases/units,
                       independente_cases/units, reconciliated_cases/units,
                       is_weight_count
solo_sessions      — id, title, status ('open'|'closed'), created_at,
                     access_pin VARCHAR(4) NULL, counter_name TEXT NULL (migration 018)
solo_entries       — id, session_id, brand_code, brand_name, pallets, cases, units,
                     final_cases, final_units, is_weight_count, counted_at
```

## Clientes Supabase — QUAL usar onde
```
lib/supabase-client.ts  → createClient()        browser (client components, 'use client')
lib/supabase-server.ts  → createClient()        server (server components, actions)
lib/supabase-admin.ts   → createAdminClient()   service_role (bypass RLS, criar usuários)
```
**ARMADILHA CRÍTICA**: `lib/supabase-client.ts` exporta `createClient`, NÃO `createBrowserClient`. Errar o nome quebra o build (Turbopack falha imediatamente).

## Padrão Realtime (autenticação obrigatória)
Sempre que criar canal Realtime em client component:
```typescript
useEffect(() => {
  const supabase = createClient()  // lib/supabase-client
  let channel: ReturnType<typeof supabase.channel> | null = null
  supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token
    if (!token) return
    supabase.realtime.setAuth(token)  // OBRIGATÓRIO antes de subscribe
    channel = supabase
      .channel('nome-unico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xxx', filter: `col=eq.${id}` },
        () => router.refresh())
      .subscribe()
  })
  return () => { if (channel) supabase.removeChannel(channel) }
}, [router])
```
**Por quê**: sem `setAuth(token)`, conecta como anon → RLS falha → sem eventos.

## Fórmulas de contagem

### Normal
```
armazenado: final_cases = pallets × pallet_size + cases; final_units = units
```
Na reconciliação: `reconciliated_cases = pallets * pallet_size + cases`

### Peso (is_weight_count = true)
```
tara = num_boxes × box_tare_g
liquido = gross_weight_g - tara
units_total = liquido / weight_avg
arredondamento: decimal >= 0.7 → ceil, senão floor
final_cases = floor(units_total / BPU)
final_units = units_total % BPU
```

### Tolerância peso no finalize_team_count (migration 017)
- `tolerance_g` configurado na criação da sessão (campo no `/admin/sessao`, default 0 = match exato)
- Lógica SQL: exact match verificado PRIMEIRO; tolerância só se `tolerance_g > 0` AND ambos usaram weight mode AND `weight_avg > 0`
- `v_tol_units = CEIL(tolerance_g::NUMERIC / weight_avg)` → `ABS(c1_total - c2_total) <= v_tol_units` → combinado

## Formato de exibição
Sempre `cases+units` (ex: `10+21`). Sem labels ("cx", "un"). Aplicado em toda a UI.

## Cartões de impressão (PR #23)
- Rota: `/admin/sessao/[id]/imprimir` — server component
- `qrcode` package, geração SVG server-side (sem request externo)
- URL do QR = host do request (sem env var hardcoded)
- Print CSS: `@page { size: A4; margin: 1.5cm }`, `break-after: page` entre equipes

## Convenções de código
- `bin_location` sempre NULL — foi removido do fluxo no PR #22
- `router.refresh()` após mutações + Realtime como reforço
- RLS: contadores só vêem o próprio team_id; admin usa service_role
- Nomes de channel: `'reconciliacao-admin'`, `'reconciliacao-counter'`, `'progresso-live'`

## Armadilhas conhecidas
1. `createBrowserClient` NÃO existe no export de `lib/supabase-client.ts` — usar `createClient`
2. Realtime sem `setAuth(token)` → anon → RLS bloqueia → sem eventos
3. `finalize_team_count` só funciona para role `admin`
4. `confirmarReconciliacao` e `resolverItemReconciliacao` só para role `independente`
5. PowerShell 5.1 + Excel COM → `InvalidCastException` com Double — usar `xlsx` (já instalado) ou Python openpyxl
6. `bin_location` foi removido (PR #22) — sempre NULL nas novas entradas
7. **Duas sessao/page.tsx**: `app/(admin)/sessao/page.tsx` → rota `/sessao`; `app/admin/sessao/page.tsx` → rota `/admin/sessao` (que o usuário acessa). Verificar no Vercel build log antes de editar qualquer página.
8. **Solo PIN counter**: `/solo/[id]` e `/solo/[id]/contar` são rotas SEM Supabase auth — acesso via cookie `solo_pin_{sessionId}`. Server actions usam `createAdminClient()` (bypass RLS) para ler/escrever.
