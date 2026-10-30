# Estado — 2026-10-30

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), achados do mini-teste corrigidos e nova ordem de assinatura (#100: contadores, Independente por último, admin fecha; migration `team_flow_admin_close` aplicada em 30/10). Backup diário desde 28/10 (#95). Solo é usado quase todo dia.

## Em andamento: visual "Chão de armazém" (aprovado em 30/10)
Regras em DECISOES 30/10. Entrega em partes:
- A (esta PR): cores, fontes, componentes base (`components/ui.tsx`), cabeçalho único em todas as áreas, login, telas do contador e do Independente no celular, busca/lista/formulário/sucesso compartilhados (mudam também a Solo), monitor com cores e flash, assinaturas. Fotos das telas do teste ficam no CI (artefato "screens").
- B: tabela do admin para iPad/notebook (cartões por equipe, tabela larga ao vivo).
- C: demais telas de admin e Solo no mesmo padrão; auditoria do "voltar" em todas as telas.

## Também em andamento
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10) e Inventory com abas.
- Limpeza pequena: remover a prévia da recuperação de warehouses.

## Teste manual pendente (Yuri, warehouse TESTE)
Cartões com QR, "Hello, nome", aviso de rejeição e nova ordem de assinatura com "Confirm and close team" (#100).

## Decisões pendentes de Yuri
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
