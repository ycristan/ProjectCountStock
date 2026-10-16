# Estado — 2026-10-16

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, correção do arredondamento por peso (Solo e reconciliação legada) e correção do Independente no legado (#85, migration aplicada em 15/10). Fluxo de equipes publicado ainda é o legado de três pessoas. Solo é usado quase todo dia.

## Em andamento
- Fluxo novo de equipes na PR #79 (rascunho, ~7.500 linhas): blocos 1–8, 11 e 12 prontos, não publicados. Próximo: plano de ativação em produção (renomear migrations, cópia de teste do banco, janela) e contagem simulada até 11/12.
- Ferramentas do agente: #87 publicada. Esta PR: `main` protegida por ruleset no GitHub (só PR com squash, typecheck/lint e memória verdes); trava local de push removida.

## Decisões pendentes de Yuri
- Liberar `cdn.sheetjs.com` na rede do ambiente de nuvem: sem isso as sessões não instalam o projeto nem rodam testes locais.
- Desativar a skill de conta `contagem-estoque-cega` (descreve o fluxo antigo de 3 contadores e compete com `docs/`) e o plugin Codex (contraria "agente único").

## Problema conhecido em produção
Nenhum conhecido no fluxo de equipes. A correção do Independente (#85) não foi testada em tela com sessão real: entra no roteiro da contagem simulada.

## A verificar
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Conector do Supabase: leituras funcionam; gravações (apply_migration, execute_sql) travaram por tempo esgotado em 15/10. Resolver antes das migrations da #79.
- Backup de 2026-09-18 nunca restaurado em teste; está só no computador de Yuri.
- Sentry só capta falhas não tratadas; erros mostrados na tela (ex.: falha ao salvar) não chegam lá.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.
- Migrations da #79 com data anterior à última aplicada em produção (20261007120000): renomear antes de aplicar e tirar as políticas do Independente já levadas pela #85.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
