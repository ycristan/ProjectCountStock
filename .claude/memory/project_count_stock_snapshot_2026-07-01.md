---
name: project-count-stock-snapshot-2026-07-01
description: "Count Stock — estado do repositório em 2026-07-01 (supera o snapshot 2026-06-29): PRs #24–#44, solo count, Excel, achado de colisão de sessão, pendências"
metadata:
  type: project
  updatedOn: 2026-07-01
---

# Count Stock — Snapshot 2026-07-01 (supera 2026-06-29)

## Modelo atual do processo
- **Contador 1 e Contador 2 contam cego.** **Independente MONITORA ao vivo e RECONCILIA** discrepâncias — não faz mais contagem cega.
- `finalize_team_count` compara **só C1 vs C2** por `brand_code` (combinado se iguais; senão discrepância). `independente_cases`/`units` ficam **NULL** (coluna legada).
- **Valor oficial do item / merged:** `resolvido → reconciliation`; senão `→ Contador 1` (C1=C2). `independente_cases` só se preenchido (legado). Vale na tela (`CombinacaoClient.getMerged`) e no Excel (helper `official()`, PR #44).

## PRs mergeados desde #23
#27 Excel export · #28 nomes de contadores · #29 tela unificada **Live Count** (`/combinacao`; `/progresso` redireciona) · #30 inventory sync + bloqueia negativos · #31 **tradução UK English** · #32 independente reconciliador + busca v2 · #34 C1/C2 veem lista read-only · #35 admin delete team / clear counts · #37 independente confirma · #39 force close/delete sessão · #40/#41 fixes tabela live · #42 BPU=1 trava pallets/cases · **#44 Excel espelha a tela + aba “Template Import Reconc”** (Brand Code / Outer / Units / Status=Avl; merged de todas as equipes) · **#43 Solo Count (admin-only)**.

## Solo Count (#43)
Admin-only, **sem PIN**. Dashboard → Solo Count → `/admin/solo` (cria com só um título) → `/admin/solo/[id]` = tela de contagem que **reusa `BuscaClient`/`CountForm`** (prop `onSubmit` injetada → `lancarSoloContagem` → `solo_entries`). Botão **Finalise Solo Count** + **Export Excel**. Tabelas `solo_sessions`/`solo_entries` (migration 016, RLS admin-only, guardam pallets/cases/units + final).

## Achado importante — colisão de sessão multi-login
`@supabase/ssr` guarda **1 sessão por navegador** (cookie único). Logar 2 contas no mesmo navegador (abas diferentes) faz valer o **último login** → server actions gravam para o usuário logado atual → a contagem do C1 pode ser salva como Independente, etc.
- **Mitigação (adotada): um dispositivo (ou perfil de navegador) por contador** — modelo previsto pelos cartões QR. **Sem fix de código.**
- Correlato não corrigido: `lancarContagem` não bloqueia o independente de lançar contagem cega (nem action nem RLS `counter_write_own`). Não foi tratado porque a causa real era a colisão; se quiser hardening: guarda em `lancarContagem` + redirect em `/busca` (já existe) + RLS.

## Pendências
- **Auditoria final (2 auditores)** — única tarefa antiga ainda aberta.
- Excel **formatado com cores** (migrar export para `exceljs`) — opcional; usuário dispensou por ora.
- **Dados de SIMULAÇÃO no banco**: 1 sessão + 6 equipes × 402 itens (10% em reconciliação, disjuntos) para verificar fórmulas. **Limpar antes de uso real.**

## Armadilhas / convenções reforçadas
- Valores sempre `cases+units` (ex.: `10+21`), **sem rótulos** “cs”/”un”.
- **Reusar componentes existentes** (`CountForm`/`BuscaClient`) em vez de reimplementar telas — ver [[feedback-reuse-components]].
