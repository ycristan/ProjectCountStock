# Estado — 2026-10-08

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
- Fluxo novo de equipes nesta PR (#79): blocos 1–8 e 11 prontos, não publicados. Bloco 11: contador ausente durante a contagem; assinatura por PIN na tela da coleta; ausências formalizadas (Independente ausente exige testemunha); primeira confirmação congela; última encerra a equipe e revoga acessos. Próximo: bloco 12 (lista de ativos não contados, consolidado, Excel, Audit Count).
- Correções da auditoria feitas: inventário carregado uma vez; mesma busca/"Add to Count"/"Edit Count" das telas atuais; monitor em `cases+units`.
- Regras revisadas com Yuri em 2026-10-05: substituição e Independente compartilhado adiados; contador ausente simples; assinatura por PIN + nome completo; lista de ativos não contados antes do zero.
- Bloco restante para 02/01: 12. Menu "Audit Count" no bloco 12.

## Decisões pendentes de Yuri
Nenhuma no momento.

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção na #79, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Limite de tentativas de login do Supabase (PIN de 4 dígitos), agora também na assinatura por PIN.
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste.
- Sentry lido pelo agente desde 06/10: sem dado pessoal; só capta falhas não tratadas. Erros que as telas mostram ao usuário (ex.: falha ao salvar) não chegam lá.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.
- Migrations desta PR com data anterior à última aplicada em produção (21/09 e 22/09): renomear antes de aplicar.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
