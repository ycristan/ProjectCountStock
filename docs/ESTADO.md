# Estado — 2026-10-05

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite aprovadas por Yuri (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: se o fluxo novo não estiver pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo.

## Em produção
`main` com inventário por warehouse, ZIP e recuperação BDS aplicada. Fluxo de equipes publicado ainda é o legado de três pessoas, com a regressão do Independente (abaixo).

## Em andamento
- Novo fluxo de equipes: blocos 1–4 prontos na PR #74 (rascunho), não publicados. Próximo: limpar a #74 (laboratório Codespace, memória antiga, alinhar à `main`) e seguir para o bloco 5.
- Repositório limpo em 2026-10-05: só `main` e a branch da #74.

## Decisões pendentes de Yuri
1. Encerrar a sessão de equipes de teste aberta desde 01/10 (sem equipes)? Só com autorização.
2. Revisar as regras pré-aprovadas com o agente, antes do bloco 6 (inclui a tolerância de peso de 50% do BPU).

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): segundo a PR #72, contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção existe na #74, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Inventário BDS hoje: 2.301 produtos (460 ativos / 1.841 inativos). Logo após a recuperação: 2.295 (446 / 1.849). Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste.
- Sentry hospedado: o agente não tem leitura; recebimento contínuo não confirmado.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual.
