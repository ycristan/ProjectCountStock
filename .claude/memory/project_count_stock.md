---
name: project-count-stock
description: "Count Stock — sistema de contagem física inventário cega tripla: stack, estado atual completo (PR #23), o que falta, links de acesso e fluxo geral"
metadata:
  type: project
  originSessionId: 30e6d838-8f3e-4fe9-93ee-1594f3d6dd51
  updatedOn: 2026-06-29
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
- `xlsx` — upload/download de inventário
- `qrcode` — geração de QR codes server-side (adicionado PR #23)

## Estrutura de pastas chave
```
app/
  admin/                          ← rotas do admin (layout max-w-7xl)
    sessao/[id]/
      equipes/                    ← criar e gerenciar equipes + contadores
        _components/EquipesForm.tsx
        _components/EquipesGerenciar.tsx  ← botão "Cartões QR"
      imprimir/                   ← NOVO PR #23: página de impressão de cartões
        page.tsx                  ← server component, gera QR inline
        _components/PrintButton.tsx
      progresso/                  ← monitoramento ao vivo (Realtime)
        _components/ProgressoClient.tsx
      reconciliacao/[teamId]/     ← admin acompanha reconciliação ao vivo
        page.tsx
        _components/ReconciliacaoClient.tsx   ← Realtime (PR #23)
  (counter)/
    busca/                        ← tela mobile de busca + lançamento cego
    finalizacao/                  ← contador finaliza sua contagem
    reconciliacao/                ← independente reconcilia discrepâncias
      page.tsx
      _components/ReconciliacaoCounterClient.tsx  ← Realtime + Pallets (PR #23)
actions/
  auth.ts
  contagem.ts          ← buscarItens, lancarContagem (bin_location = NULL desde PR #22)
  finalizacao.ts
  inventario.ts
  reconciliacao.ts     ← listarDiscrepancias (inclui pallet_size desde PR #23)
  sessao.ts            ← criarEquipes, listarEquipes, criarSessao, uploadInventory
lib/
  supabase-client.ts   ← exporta createClient() (browser, wraps @supabase/ssr)
  supabase-server.ts   ← exporta createClient() (server, cookies)
  supabase-admin.ts    ← exporta createAdminClient() (service_role)
supabase/migrations/
  001_schema.sql
  002_functions.sql
  003_rls.sql
  004_finalized_at.sql
  010_remove_bin_from_finalize.sql  ← finalize_team_count sem bin_location (PR #22)
```

## Fluxo completo do processo
1. **Admin cria sessão** → define nº de equipes e box_tare_g (tara padrão das caixas)
2. **Admin cria equipes** → cada equipe: Contador 1, Contador 2, Independente
   - Credenciais geradas: `team_pin` (4 dígitos, compartilhado) + `user_pin` (4 dígitos, pessoal)
   - Login: email `${team_pin}${user_pin}@count.local`, senha = `user_pin`
   - Cartões impressos via `/admin/sessao/[id]/imprimir` — QR code aponta para URL do app
3. **Contadores 1 e 2 contam** — cega (não vêem a contagem um do outro), lançam via mobile
4. **Independente conta** — também cego
5. **Admin finaliza equipe** → `finalize_team_count` RPC agrupa por brand_code:
   - Se todos 3 iguais (ou dentro da tolerância de peso): status `combinado`
   - Se diverge: status `discrepancia`, cria `reconciliation_items`
6. **Independente reconcilia** — vê os itens discrepantes, registra valor acordado
   - Form normal: Pallets × pallet_size + Cases + Units → reconciliated_cases/units
   - Form peso: Nº caixas + Peso bruto → calcula via weight_avg e box_tare_g
7. **Admin monitora reconciliação ao vivo** via Realtime
8. **Independente confirma** → team.status = 'reconciliada'
9. **[TODO] Combinação entre equipes** → agrega por brand_code entre equipes reconciliadas
10. **[TODO] Auditoria final** → 2 auditores aprovam independentemente
11. **[TODO] Exportação Excel** → uma aba por equipe + aba consolidada (N equipes dinâmico)

## Sistema de credenciais
- `teams.team_pin` — 4 dígitos, igual para todos da equipe
- `counter_accounts.user_pin` — 4 dígitos, individual
- Email de login: `${team_pin}${user_pin}@count.local`
- Senha de login: `user_pin`
- Armazenados em `counter_accounts` (acessível via admin client)

## O que foi implementado — histórico de PRs
| PR | Branch | O que fez |
|----|--------|----------|
| #11 | — | Tela mobile busca + lançamento cego |
| #12 | — | Finalizar contagem + admin progresso |
| #13 | — | Admin reconciliação (view estático) |
| #21 | fix/live-progress-view | **Realtime auth fix** no ProgressoClient (getSession → setAuth antes de subscribe) |
| #22 | feat/remove-bin-selection | Remove BIN do fluxo de contagem; admin layout max-w-7xl; tabela progresso `10+21` com bordas |
| #23 | fix/reconciliacao-live | Realtime em admin+independente reconciliação; Pallets no form normal; cartões de impressão com QR |

## O que FALTA implementar
1. **Combinação entre equipes** — página admin agrega resultados por brand_code entre todas equipes reconciliadas → tabela `combined_results`
2. **Auditoria final** — 2 auditores aprovam → tabela `audit_approvals`
3. **Exportação Excel dinâmica** — formato já definido: uma aba por equipe + aba Consolidado, N equipes dinâmico

## Why / How to apply
Yuri é o dono do negócio; Claude é responsável por todo código. Todo código vai ao GitHub via MCP (`mcp__github__*`) — branch + push + PR. Nunca escrever código para o usuário copiar/colar manualmente. Mergear PRs com squash.
