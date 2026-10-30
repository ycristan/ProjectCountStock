# Estado — 2026-10-30

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, peso corrigido, correção do Independente no legado (#85) e fluxo novo (#91, #93) ligado (`TEAM_SETUP_ENABLED=true` desde 29/10). Backup diário desde 28/10 (#95). Solo é usado quase todo dia.

## Mini-teste de 29/10 (warehouse TESTE, 1 equipe real)
Fluxo completo rodou até o Excel final e o Audit Count. Achados de Yuri:
- Corrigido nesta PR: cartões com QR de volta no "Print"; nome de quem está logado no topo das telas de equipe; admin vai à tela de fechamento quando a equipe fecha (antes via "Team access unavailable... sign in again" e precisou relogar); aviso vermelho ao contador quando o Independente rejeita a finalização.
- Nesta PR também: nova ordem de assinatura (contadores, Independente por último, admin clica "Confirm and close team", só então acessos revogados) — DECISOES 29/10. Migration `20261029100000_team_flow_admin_close` a aplicar com autorização de Yuri, no mesmo momento do merge.
- Peso: 320 g e 350 g num produto de 300 g deram 1 unidade, correto pela regra (≥ 0,7 sobe). Teste de 100/98 precisa de produto com peso médio pequeno (ex.: 10 g).
- Visual reprovado (genérico, botões que parecem texto, não mobile; monitor sem cores/flash do legado). Próximo: proposta visual das telas de equipe para Yuri aprovar antes do código, com a skill `frontend-design` e prints do legado (DECISOES 30/10).

## Em andamento
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10) e Inventory com abas.
- Limpeza pequena: remover a prévia da recuperação de warehouses.

## Decisões pendentes de Yuri
- Aprovar a proposta visual (quando entregue).
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Conector do Supabase: lê e grava, mas trava em qualquer `drop`.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
