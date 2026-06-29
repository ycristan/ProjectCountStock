# Count Stock — Contexto para Claude Code

Este arquivo é lido automaticamente pelo Claude Code ao abrir o projeto.

## O que é este projeto
Sistema de **contagem física de inventário cega tripla** para uso em warehouse. Três contadores contam independentemente sem ver a contagem dos outros; o sistema detecta discrepâncias e coordena a reconciliação.

## Links de acesso
- **GitHub**: https://github.com/ycristan/ProjectCountStock
- **Supabase**: https://supabase.com/dashboard/project/sktpzvlmeegyuqsvtunx
- **Vercel**: https://vercel.com/ycristans-projects/project-count-stock-ylmm

## Stack
- Next.js 16.2.9 + React 19 + TypeScript
- Tailwind CSS 4
- Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/ssr`
- `xlsx` — upload/download de inventário
- `qrcode` — geração de QR codes server-side

## Regras de trabalho
- **Todo código vai ao GitHub via MCP** (`mcp__github__*`): criar branch → push arquivos → abrir PR. Nunca escrever código para o usuário copiar/colar.
- **Sempre PR**, nunca push direto na main (exceto se o usuário mandar explicitamente).
- **Merge com squash**.
- **Plugin Ponytail ativo** em toda tarefa de código (modo full).
- O usuário é gerente de projeto, não dev — todas as decisões técnicas ficam com o Claude.

## Fluxo do processo (ordem cronológica)
1. Admin cria sessão (define `box_tare_g` — tara padrão das caixas em gramas)
2. Admin cria equipes → cada equipe: Contador 1 + Contador 2 + Independente
   - Credenciais: `team_pin` (4 dígitos, compartilhado) + `user_pin` (4 dígitos, pessoal)
   - Login: email `${team_pin}${user_pin}@count.local`, senha = `user_pin`
   - Cartões impressos via `/admin/sessao/[id]/imprimir` com QR code
3. Contadores 1 e 2 contam (cego — não vêem um ao outro)
4. Independente conta (também cego)
5. Admin executa `finalizarEquipe` → RPC `finalize_team_count` agrupa por `brand_code`:
   - Todos 3 iguais → `combinado`
   - Diverge → `discrepancia` → cria `reconciliation_items`
6. Independente reconcilia itens discrepantes (form: Pallets × Cases + Units, ou por peso)
7. Admin monitora reconciliação ao vivo (Realtime)
8. Independente confirma → `team.status = 'reconciliada'`
9. **[TODO]** Combinação entre equipes → agrega por brand_code
10. **[TODO]** Auditoria final → 2 auditores aprovam
11. **[TODO]** Exportação Excel → uma aba por equipe + aba Consolidado (N equipes dinâmico)

## Estrutura de pastas
```
app/admin/sessao/[id]/
  equipes/          — criar e gerenciar equipes; botão "Cartões QR"
  imprimir/         — página de impressão de cartões com QR code (server component)
  progresso/        — monitoramento ao vivo (Realtime)
  reconciliacao/    — admin acompanha reconciliação ao vivo (Realtime)
app/(counter)/
  busca/            — tela mobile busca + lançamento cego (normal ou por peso)
  finalizacao/      — contador finaliza sua contagem
  reconciliacao/    — independente reconcilia discrepâncias (Realtime)
actions/
  sessao.ts         — criarEquipes, listarEquipes, uploadInventory
  contagem.ts       — buscarItens, lancarContagem
  reconciliacao.ts  — listarDiscrepancias (inclui pallet_size), resolverItem, confirmar
  finalizacao.ts    — finalizarContagem
lib/
  supabase-client.ts  — exporta createClient() para browser (NÃO createBrowserClient)
  supabase-server.ts  — exporta createClient() para server
  supabase-admin.ts   — exporta createAdminClient() com service_role
supabase/migrations/
  010_remove_bin_from_finalize.sql  — finalize_team_count sem bin_location
```

## Schema — tabelas principais
```sql
count_sessions      id, status, box_tare_g
teams               id, session_id, team_name, team_pin, status
counter_accounts    auth_user_id, team_id, role, username, user_pin
inventory_items     brand_code(PK), brand_name, bpu, pallet_size, weight_avg, category, category1
item_bin_locations  brand_code, bin_location  (informativo, não usado na contagem)
count_entries       id, team_id, brand_code, bin_location(NULL), counter_role,
                    final_cases, final_units, is_weight_count, gross_weight_g, num_boxes
reconciliation_items  id, team_id, brand_code, status, contador_1_cases/units,
                      contador_2_cases/units, independente_cases/units,
                      reconciliated_cases/units, is_weight_count
```

## Padrões críticos de código

### Clientes Supabase
```typescript
// browser (client components): lib/supabase-client.ts
import { createClient } from '@/lib/supabase-client'  // NÃO createBrowserClient!

// server (server components, actions): lib/supabase-server.ts
import { createClient } from '@/lib/supabase-server'

// admin/bypass RLS: lib/supabase-admin.ts
import { createAdminClient } from '@/lib/supabase-admin'
```

### Realtime — padrão obrigatório de autenticação
```typescript
useEffect(() => {
  const supabase = createClient()
  let channel: ReturnType<typeof supabase.channel> | null = null
  supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token
    if (!token) return
    supabase.realtime.setAuth(token)  // OBRIGATÓRIO — sem isso RLS bloqueia eventos
    channel = supabase
      .channel('nome-unico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xxx',
        filter: `col=eq.${id}` }, () => router.refresh())
      .subscribe()
  })
  return () => { if (channel) supabase.removeChannel(channel) }
}, [router])
```

### Fórmulas de contagem
```
// Normal
reconciliated_cases = pallets * pallet_size + cases
reconciliated_units = units

// Por peso
tara = num_caixas * box_tare_g
liquido = gross_weight_g - tara
units_raw = liquido / weight_avg
final_units = decimal >= 0.7 ? ceil(units_raw) : floor(units_raw)
final_cases = floor(final_units / BPU) // units aqui é total de unidades, não resto

// Tolerância no finalize RPC (se todos usaram peso)
combinado se: GREATEST - LEAST <= 200g
```

### Formato de exibição de valores
Sempre `cases+units` (ex: `10+21`). Sem labels (sem "cx", sem "un") na tabela de progresso.

## Histórico de PRs (todos mergeados na main)
| PR | O que fez |
|----|-----------|
| #11 | Tela mobile busca + lançamento cego |
| #12 | Finalizar contagem + admin progresso |
| #13 | Admin reconciliação (view estático inicial) |
| #21 | Realtime auth fix no ProgressoClient |
| #22 | Remove BIN do fluxo; admin layout max-w-7xl; tabela progresso com bordas |
| #23 | Realtime em admin+independente; Pallets no form normal; cartões impressão com QR |

## Próximas tarefas (em ordem)
1. **Combinação entre equipes** — `/admin/sessao/[id]/combinacao`
   - Agrega brand_code entre equipes reconciliadas
   - `merged_cases = FLOOR(Σ(final_cases×BPU + final_units) / BPU)`
   - `merged_units = Σ(final_cases×BPU + final_units) % BPU`
2. **Auditoria final** — 2 auditores aprovam independentemente
3. **Exportação Excel dinâmica** — uma aba por equipe + aba Consolidado, N equipes

## Exportação Excel — formato definido
Baseado no arquivo de referência `valores de contagens.xlsx` (estava no desktop do usuário).
Colunas por equipe: Brand Category | Brand Category 1 | Brand Code | Brand Name | BPU | Cnt1 Cases | Cnt1 Units | Cnt2 Cases | Cnt2 Units | Ind Cases | Ind Units | Reconciliation Cases | Reconciliation Units | Final Count Cases | Final Count Units
Aba Consolidado: todas equipes side-by-side + Merged Count (azul) à direita.
N equipes dinâmico — **não** hardcoded para 3 equipes.

## Armadilhas conhecidas
1. `lib/supabase-client.ts` exporta `createClient`, NÃO `createBrowserClient` — errar o nome quebra o build Turbopack
2. Realtime sem `setAuth(token)` → conexão anon → RLS bloqueia → sem eventos
3. `finalize_team_count` só funciona para role `admin`
4. `confirmarReconciliacao` e `resolverItemReconciliacao` só para role `independente`
5. PowerShell 5.1 + Excel COM tem `InvalidCastException` com Double → usar Python openpyxl para XLSX
6. `bin_location` foi removido do fluxo de contagem (PR #22) — sempre NULL nas novas entradas
