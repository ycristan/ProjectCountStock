# Estado — 2026-11-26

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo (feito, #127);
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), painel do admin, contagem ao vivo, Inventory com abas por warehouse, Audit Inventory gravado pelo banco (#119), Auditor (#122), assinatura no próprio aparelho (#124), título obrigatório (#125) e teste automático com 9 usuários + repetição automática de Finish/Accept em colisão (#127). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento — Excel em inglês e vigilância de erros (Sentry)
- Excel do Solo quebrava com `: / \ ? * [ ]` no título (20 de 99 sessões em 26/11); corrigido nesta PR.
- Excel de equipes: aba "Consolidated" (antes "Consolidado") e "Note" repetida na aba "Template Import Reconc".
- Sentry: preview separado de produção no navegador; erros só de tela das equipes enviados como aviso; alerta por e-mail para todo erro novo em produção e monitor do `/login` a cada 5 min (já criados no Sentry em 26/11).
- Falta: mapas de código para stack legível (token do Sentry na Vercel; o conector não grava variáveis).

## Decisões pendentes de Yuri
- Tolerância em gramas (`default_tolerance_g`, `tolerance_g`): só o fluxo antigo usa; remover com ele depois de 02/01.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).
- O título da sessão não aparece no Auditor, nas telas dos contadores nem no nome do Excel: só se Yuri pedir.

## Próximo
- Tela Audit Inventory (INVENTORY_WAREHOUSES.md §1, PR 6): período, produtos e Excel. Pode entrar antes de 02/01.
- Varredura de idioma: todo texto da aplicação em inglês britânico (PRODUTO.md); ~60 textos em português.
- Itens 2 e 3 de TEAM_COUNT_PLAN.md, "Achados do teste de Yuri em 02/11". Yuri assumiu o risco no prazo de 27/11.

## A verificar
- Yuri ainda não mediu o Inventory depois de #115 e #116 (antes: 4 a 5 s).
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação; o Audit Inventory evita isso daqui em diante.
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.
- Sessão nova deste projeto: escolher o ambiente `countstock` (libera cdn.sheetjs.com para o npm).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados (não por IP: os celulares da warehouse saem pelo mesmo Wi-Fi); aprovação dupla de BPU; itens desconhecidos com foto; código de barras; ajuste pós-assinatura; substituição e Independente compartilhado; transferência de produto entre warehouses.
