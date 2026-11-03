# Estado — 2026-11-03 (PR 2)

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), painel do admin, contagem ao vivo consolidada, Inventory em lista única, paleta Next Chain, barra inferior no celular e Hold to finish (#107). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento — Inventory por warehouse (decisão de 03/11, antes de equipes)
Ordem das PRs (contrato em INVENTORY_WAREHOUSES.md §1):
1. Documentos (#108, feita).
2. Esta PR: abas por warehouse e carregar só a warehouse da aba; tempos medidos no CI (descrição da PR).
3. Tabela nova: colunas da planilha, cabeçalho fixo, rolagem interna, edição sem deslocar colunas; virtualização só se a medição pedir.
4. Filtros por coluna.
5a. Audit Inventory no banco (trigger, só acréscimo). Migration: aplicação manual com autorização.
5. Toggle de Status, cadastro manual, edição transacional, BPU travado também com sessão de equipes. Migration: aplicação manual com autorização.
6. Tela Audit Inventory com período e produtos selecionáveis, Excel com os mesmos filtros.

## Depois do Inventory
- Varredura de idioma: todo texto da aplicação em inglês britânico (PRODUTO.md); ~60 textos em português achados por busca simples, mais grafia americana a conferir.
- Itens 2, 3, 4 e 6 de TEAM_COUNT_PLAN.md, "Achados do teste de Yuri em 02/11". Yuri assumiu o risco no prazo de 27/11.
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- Tolerância em gramas (`default_tolerance_g`, `tolerance_g`): só o fluxo antigo usa; remover com ele depois de 02/01.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação; o Audit Inventory evita isso daqui em diante, não explica o passado.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; ajuste pós-assinatura; substituição e Independente compartilhado; transferência de produto entre warehouses.
