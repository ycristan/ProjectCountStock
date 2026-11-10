# Estado — 2026-11-10

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), painel do admin, contagem ao vivo, Inventory com abas por warehouse, tabela virtualizada e filtros estilo Excel, região dub1 e RLS mais leve (#114–#116, migrations aplicadas). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento — Inventory por warehouse (contrato em INVENTORY_WAREHOUSES.md §1)
Agora: PR 5 aberta. Toggle de Status, cadastro manual e edição numa transação só (`save_inventory_item`). Migration já aplicada em produção (10/11, autorizada por Yuri); falta o merge, que depende de Yuri.
Depois: 5a (Audit Inventory no banco, trigger só de acréscimo; migration com autorização) e 6 (tela Audit Inventory com Excel; candidata a ficar para depois de 02/01, decisão de Yuri pendente).
Yuri ainda não mediu o Inventory depois de #115 e #116 (antes: 4 a 5 s).

## Depois do Inventory
- Varredura de idioma: todo texto da aplicação em inglês britânico (PRODUTO.md); ~60 textos em português achados por busca simples.
- Itens 2, 3, 4 e 6 de TEAM_COUNT_PLAN.md, "Achados do teste de Yuri em 02/11". Yuri assumiu o risco no prazo de 27/11.
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- PR 6 antes ou depois de 02/01.
- Cadastro manual durante contagem de equipes aberta não é bloqueado (o contrato não pede). Confirmar.
- Tolerância em gramas (`default_tolerance_g`, `tolerance_g`): só o fluxo antigo usa; remover com ele depois de 02/01.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação; o Audit Inventory evita isso daqui em diante.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Sessão nova deste projeto: escolher o ambiente `countstock` (libera cdn.sheetjs.com para o npm).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; ajuste pós-assinatura; substituição e Independente compartilhado; transferência de produto entre warehouses.
