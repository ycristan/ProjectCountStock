# Estado — 2026-10-06

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo.

## Em produção
`main` com inventário por warehouse, ZIP e recuperação BDS aplicada. Fluxo de equipes publicado ainda é o legado de três pessoas, com a regressão do Independente (abaixo). Solo é usado quase todo dia.

## Em andamento
- Correção do arredondamento por peso (Solo e reconciliação legada): fração exata de 0,7 caía para baixo (1.070 g / 100 g = 10, não 11). PR própria, publicada antes do fluxo novo por causa do uso diário do Solo.
- Fluxo novo de equipes na PR #79: blocos 1–7 prontos, não publicados. Próximo: bloco 8 (revisão do admin e recontagens). Depois desta correção, trazer a `main` para a #79.
- Restam para 02/01: blocos 8, 11, 12. Menu "Audit Count" no bloco 12.
- Regras e decisões de 05/10 (auditoria, pesagem com peso bruto e caixas, bloco 7) estão no `docs/DECISOES.md` da #79, ainda não na `main`.

## Decisões pendentes de Yuri
Nenhuma no momento.

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção na #79, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Limite de tentativas de login do Supabase (PIN de 4 dígitos).
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste. Sentry hospedado sem leitura pelo agente.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.
- Migrations da #79 com data anterior à última aplicada em produção (21/09 e 22/09): renomear antes de aplicar.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
