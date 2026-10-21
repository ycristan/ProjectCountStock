# Estado — 2026-10-21

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, correção do arredondamento por peso e correção do Independente no legado (#85). Fluxo de equipes publicado ainda é o legado de três pessoas. Solo é usado quase todo dia. Nenhuma sessão de equipes aberta em produção (consulta de 21/10).

## Em andamento
- Fluxo novo de equipes (blocos 1–8, 11 e 12) atualizado com a `main`: migrations com data nova, políticas do Independente só na #85, testes completos verdes no ambiente do agente. Substitui a #79.
- Estrutura do banco de produção conferida em 21/10 (só leitura): igual à do repositório, exceto duas colunas antigas que só existem lá (`teams.team_pin`, `solo_sessions.access_pin`). Com elas, as 9 migrations aplicam e os testes passam.
- Próximo: Yuri autorizar a aplicação em produção e a janela.

## Plano de ativação (proposto, não aprovado)
1. Feito: teste com a estrutura de produção (sem dados pessoais) num banco descartável.
2. Janela sem sessão de equipes aberta: aplicar as 9 migrations em produção (com autorização de Yuri).
3. Merge da PR com `TEAM_SETUP_ENABLED` desligado: legado continua igual.
4. Ligar `TEAM_SETUP_ENABLED` na Vercel e fazer a contagem simulada em warehouse de teste.

## Decisões pendentes de Yuri
- Autorizar a aplicação das 9 migrations em produção e a janela.
- `solo_sessions.access_pin` não é usado pelo código: decidir depois se sai (não bloqueia).

## A verificar
- Teste manual (#90): Combinação atualiza sem recarregar. Fazer na contagem simulada (cobre também T51).
- Correção do Independente (#85) não testada em tela com sessão real: entra na contagem simulada.
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Conector do Supabase: leitura por SQL voltou a funcionar em 21/10; gravação ainda não testada.
- Backup de 2026-09-18 nunca restaurado em teste; está só no computador de Yuri.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
