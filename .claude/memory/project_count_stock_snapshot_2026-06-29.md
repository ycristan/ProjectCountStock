---
name: project-count-stock-snapshot-2026-06-29
description: "Count Stock — snapshot do estado do repositório em 2026-06-29 após merge dos PRs #22 e #23: arquivos chave, o que cada um faz, e próximas tarefas"
metadata:
  type: project
  originSessionId: 30e6d838-8f3e-4fe9-93ee-1594f3d6dd51
  updatedOn: 2026-06-29
---

# Count Stock — Snapshot 2026-06-29

## Último estado mergeado na main
PRs #22 e #23 mergeados em squash em 2026-06-29.
Commit da main após merge: `8987b02` (PR #23) e `5d60a99` (PR #22).

## Arquivos críticos e o que fazem

### actions/
| Arquivo | Responsabilidade |
|---------|------------------|
| `sessao.ts` | `criarSessao`, `criarEquipes` (gera team_pin + user_pin, cria auth users), `listarEquipes`, `uploadInventory` |
| `contagem.ts` | `buscarItens` (busca + entryExistente sem bin), `lancarContagem` (bin_location = null) |
| `reconciliacao.ts` | `listarDiscrepancias` (inclui pallet_size), `resolverItemReconciliacao`, `confirmarReconciliacao`, `finalizarEquipe` |
| `finalizacao.ts` | `finalizarContagem` — muda status da equipe para 'finalizada' |
| `inventario.ts` | download inventário atual |
| `auth.ts` | login/logout |

### app/admin/
| Rota | Componente chave | O que faz |
|------|-----------------|----------|
| `/admin` | — | Dashboard: lista sessões |
| `/admin/sessao/[id]/equipes` | `EquipesForm`, `EquipesGerenciar` | Criar equipes / gerenciar contadores; botão "Cartões QR" |
| `/admin/sessao/[id]/imprimir` | `page.tsx` + `PrintButton` | Cartões de impressão com QR code (server-side qrcode) |
| `/admin/sessao/[id]/progresso` | `ProgressoClient` | Monitoramento ao vivo via Realtime |
| `/admin/sessao/[id]/reconciliacao/[teamId]` | `ReconciliacaoClient` | Acompanha reconciliação ao vivo (Realtime) |

### app/(counter)/
| Rota | Componente chave | O que faz |
|------|-----------------|----------|
| `/login` | — | Login com PIN |
| `/busca` | `CountForm` | Busca item + lançamento cego (normal ou por peso) |
| `/finalizacao` | — | Finaliza contagem da equipe |
| `/reconciliacao` | `ReconciliacaoCounterClient` | Independente reconcilia discrepâncias + Realtime para receber novos itens |

### lib/
| Arquivo | Export | Uso |
|---------|--------|-----|
| `supabase-client.ts` | `createClient()` | Client components (browser) |
| `supabase-server.ts` | `createClient()` | Server components + actions |
| `supabase-admin.ts` | `createAdminClient()` | Bypass RLS, criar usuários |

### supabase/migrations/
| Arquivo | O que faz |
|---------|----------|
| `001_schema.sql` | Schema base |
| `002_functions.sql` | RPCs iniciais |
| `003_rls.sql` | Políticas RLS |
| `004_finalized_at.sql` | Coluna finalized_at em teams |
| `010_remove_bin_from_finalize.sql` | finalize_team_count sem bin_location (agrupa só por brand_code) |

## Próximas tarefas (em ordem lógica)
1. **Combinação entre equipes** — página `/admin/sessao/[id]/combinacao`
   - Lê todas as equipes com status 'reconciliada'
   - Agrega por brand_code: soma `final_cases × BPU + final_units` de todas equipes
   - Calcula merged_cases = FLOOR(total_un / BPU), merged_units = total_un MOD BPU
   - Armazena em `combined_results`
   
2. **Auditoria final** — 2 auditores aprovam independentemente
   - Tabela `audit_approvals` (auditor_id, session_id, approved_at)
   - Sessão só fecha quando 2 auditores aprovaram

3. **Exportação Excel dinâmica** (N equipes)
   - Formato definido: uma aba por equipe + aba Consolidado com Merged Count
   - Usar biblioteca `xlsx` já instalada (ou Python openpyxl se houver problemas de tipos)

## Dependências instaladas (package.json atual)
```json
dependencies: next 16.2.9, react ^19, react-dom ^19, @supabase/ssr ^0.5, @supabase/supabase-js ^2.45, qrcode ^1.5.4, xlsx ^0.18.5
devDependencies: typescript ^5, @types/node ^20, @types/react ^19, @types/react-dom ^19, @types/qrcode ^1.5.5, tailwindcss ^4, @tailwindcss/postcss ^4, eslint ^9
```
