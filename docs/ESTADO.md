# Estado — 2026-10-05

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo.

## Em produção
`main` com inventário por warehouse, ZIP e recuperação BDS aplicada. Fluxo de equipes publicado ainda é o legado de três pessoas, com a regressão do Independente (abaixo).

## Em andamento
- Fluxo novo de equipes nesta PR (substitui a antiga #74): blocos 1–5 prontos, não publicados. Bloco 5: o contador pede a finalização pela tela e fica bloqueado; o Independente aceita ou rejeita cada pedido. Próximo: bloco 6 (comparação), depois da revisão das regras.
- Correções da auditoria feitas: inventário carregado uma vez; tela de equipe usa a mesma busca/"Add to Count"/"Edit Count" das telas atuais; monitor em `cases+units`. Pendente: conferir limite de tentativas de login.
- Menu admin "Audit Count" (exporta todos os lançamentos e edições) entra no bloco 12.

## Decisões pendentes de Yuri
1. Encerrar a sessão de equipes de teste aberta desde 01/10 (sem equipes)? Só com autorização.
2. Revisar as regras pré-aprovadas, antes do bloco 6 (inclui a tolerância de peso de 50% do BPU).
3. Pesagem: o legado nunca guardou peso bruto e caixas. Guardar esses dados para o "Audit Count" é funcionalidade nova; confirmar se vale fazer.

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção existe nesta PR, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste. Sentry hospedado sem leitura pelo agente.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual.
