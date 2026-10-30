# Estado — 2026-10-30

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, peso corrigido, fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10) com a ordem de assinatura de 29/10 (migration `team_flow_admin_close` aplicada). Backup diário desde 28/10. Solo é usado quase todo dia.

## Visual "Chão de armazém"
- Proposta aprovada por Yuri: telas de equipe (29/10) e tela do Solo corrigida (30/10). Painel, Inventory, Sessões e sistema visual (cantos 4px, ícones, 5 botões) aguardam aprovação. Quadro: artefato "Count Stock — identidade visual".
- PR #101 (telas de equipe, parte A) **não pode ser mergeada como está**: o cabeçalho do Solo mostra o login, que contém os dois PINs. Corrigir junto com a tela do Solo aprovada (nome digitado, Log out visível, "Finish count" amarelo embaixo com confirmação, ícones).
- Depois do merge da correção: gerar novo PIN do Solo (o atual apareceu na tela durante o teste).
- Depois: admin em PRs pequenas (painel e menu, Inventory, Sessões e Ajustes).

## Em andamento
- Busca por qualquer parte do nome, código ou BIN, em uma só regra para equipe, Solo e lista do Solo (DECISOES 30/10).
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10) e Inventory com abas.
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- Correção da PR #101: na branch dela (outra sessão) ou pela outra sessão.
- Cantos de 4px também nas telas de equipe; menu novo do admin; abas do Inventory agora ou depois.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Peso: teste de 100/98 precisa de produto com peso médio pequeno (ex.: 10 g).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
