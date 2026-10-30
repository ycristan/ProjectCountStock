# Estado — 2026-10-30

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: teste automático com 9 usuários em paralelo;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com fluxo novo ligado (`TEAM_SETUP_ENABLED=true` desde 29/10), ordem de assinatura de 29/10 (migration `team_flow_admin_close` aplicada), busca por qualquer parte do nome, código ou BIN (#104). Backup diário desde 28/10. Solo é usado quase todo dia.

## Em andamento: visual "Chão de armazém" (DECISOES 30/10)
Yuri aprovou o plano completo: mesmo padrão em todas as telas e para todos os usuários (cantos 4px, ícones com texto, 5 botões, amarelo = uma ação principal). Quadro: artefato "Count Stock — identidade visual".
- A (esta PR): base visual, cabeçalho único (Log out visível, quem está logado embaixo no celular, nunca o login com PINs), login, telas de equipe e Independente, busca com ajuda por ícones, Solo aprovado (nome digitado no cabeçalho, "Finish count" amarelo embaixo com confirmação).
- B (PR empilhada sobre a A): painel do admin com contagem em andamento no topo e placas com números reais; menu novo que destaca a tela atual; contagem ao vivo consolidada de todas as equipes (tela 5b, `/admin/sessao/<id>/ao-vivo`), aberta pelo painel e pela tela de equipes.
- C: Inventory no visual novo (download como hoje); D: Sessões e Ajustes. Abas por warehouse ficam para depois (mudam o download).
- Depois do merge desta PR: Yuri gera novo PIN do Solo (o atual apareceu na tela no teste de 30/10).

## Também em andamento
- Agente: teste automático com 9 usuários; Sentry nos erros mostrados nas telas de equipe.
- Depois: histórico de alterações do inventário (aprovado em 28/10).
- O conector da Vercel não grava variáveis (403): produção é republicada por merge na `main`.

## Decisões pendentes de Yuri
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Inventário BDS: 2.295 → 2.301 → 2.310 produtos sem explicação (sem data nem autor).
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Peso: teste de 100/98 precisa de produto com peso médio pequeno (ex.: 10 g).

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
