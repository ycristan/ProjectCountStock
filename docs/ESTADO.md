# Estado — 2026-11-02

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), ordem de assinatura de 29/10 (migration `team_flow_admin_close` aplicada), busca por qualquer parte do nome, código ou BIN (#104), visual "Chão de armazém" (amarelo) nas telas de equipe e Solo (#101) e, com esta PR, painel do admin, contagem ao vivo consolidada e Inventory (#105). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento
- Paleta Next Chain e padronização de todas as telas: branch `claude/determined-ritchie-o2ip4w`, aguarda PR e teste visual.
- Barra inferior (proposta B), Hold to finish e confirmação do app: branch `claude/bottom-nav-hold-finish` (sobre a anterior), aguarda PR e teste no celular.
- Próximo: investigar a demora de 3 a 4 s ao abrir os menus do admin (Inventory e outros), medindo antes de mudar (proxy, layout, consultas, região Vercel/Supabase, tamanho da lista). Virtualização e abas por warehouse são hipóteses, não diagnóstico.
- Próximo: itens 2, 3, 4 e 6 de TEAM_COUNT_PLAN.md, "Achados do teste de Yuri em 02/11", em PRs pequenas (iniciar a sessão inteira; tabela depois do encerramento; assinatura no próprio aparelho; teste com 9 usuários).

## Também em andamento
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10).
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- Tolerância em gramas (`default_tolerance_g`, `tolerance_g`): só o fluxo antigo usa; remover com ele depois de 02/01.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Peso: teste de 100/98 precisa de produto com peso médio pequeno (ex.: 10 g).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; ajuste pós-assinatura; substituição e Independente compartilhado.
