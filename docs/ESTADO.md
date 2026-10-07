# Estado — 2026-10-07

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo.

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS e correção do arredondamento por peso (Solo e reconciliação legada). Fluxo de equipes publicado ainda é o legado de três pessoas, com a regressão do Independente (abaixo). Solo é usado quase todo dia.

## Em andamento
- Fluxo novo de equipes na PR #79: blocos 1–8, 11 e 12 prontos, não publicados. O fluxo de equipes está completo: cadastro, contagem cega, finalização, comparação, conciliação, revisão do admin, assinaturas, encerramento, ciência dos não contados, Excel final e Audit Count. Próximo: plano de ativação em produção (renomear migrations, cópia de teste do banco, janela) e contagem simulada até 11/12.
- Correções da auditoria feitas: inventário carregado uma vez; mesma busca/"Add to Count"/"Edit Count" das telas atuais; monitor em `cases+units`.
- Regras revisadas com Yuri em 2026-10-05: substituição e Independente compartilhado adiados; contador ausente simples; assinatura por PIN + nome completo; ativos não contados viram 0 após ciência do admin (revisado em 07/10).

## Decisões pendentes de Yuri
Nenhuma no momento.

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção na #79, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste.
- Sentry lido pelo agente desde 06/10: sem dado pessoal; só capta falhas não tratadas. Erros que as telas mostram ao usuário (ex.: falha ao salvar) não chegam lá.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.
- Migrations da #79 com data anterior à última aplicada em produção (21/09 e 22/09): renomear antes de aplicar.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados (ver DECISOES, 07/10); aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
