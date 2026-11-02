# Estado — 2026-11-02

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), ordem de assinatura de 29/10 (migration `team_flow_admin_close` aplicada), busca por qualquer parte do nome, código ou BIN (#104). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento
- PR #101 (visual das telas de equipe e Solo) e PR #105 (painel, contagem ao vivo consolidada, Inventory): CI verde, ainda sem merge. Teste de Yuri em 02/11 no preview achou o Finish cobrindo o Confirm: corrigir antes do merge da #101.
- Próximos passos e decisões pendentes: lista em TEAM_COUNT_PLAN.md, "Achados do teste de Yuri em 02/11".
- Depois do merge da #101: Yuri gera novo PIN do Solo (o atual apareceu na tela no teste de 30/10).

## Também em andamento
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10).
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- Iniciar a sessão inteira de uma vez; assinatura no aparelho de cada um (muda R11); barra de navegação inferior. Detalhes em TEAM_COUNT_PLAN.md (02/11).
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Peso: teste de 100/98 precisa de produto com peso médio pequeno (ex.: 10 g).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
