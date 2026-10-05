# Estado — 2026-10-05

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Em produção
`main` = PR #75 (inventário por warehouse, ZIP, recuperação BDS aplicada). Fluxo de equipes publicado ainda é o legado de três pessoas.

## Em andamento
- Novo fluxo de equipes: blocos 1–4 prontos na branch `codex/team-flow-foundation` (PR #74, rascunho), não publicados. Próximo: bloco 5 (pedido de finalização nas telas).
- Essa branch tem migrations não aplicadas e ainda carrega o laboratório Codespace, abandonado.
- Organização do repositório: limpeza de branches/PRs e revisão das regras aprovadas.

## Decisões pendentes de Yuri
1. Aprovar a lista de limpeza de branches e PRs (#56, #68, #71, #72, #73, #74).
2. Revisar as regras pré-aprovadas com o agente.
3. Regressão do Independente (vinda da PR #63): segundo a PR #72, contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". A correção existe na #72 e na #74, mas não está publicada. Não reverificado em produção. Decidir: publicar a correção isolada ou esperar o novo fluxo.

## A verificar
- Inventário BDS hoje: 2.301 produtos (460 ativos / 1.841 inativos). Logo após a recuperação: 2.295 (446 / 1.849). Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste.
- Sentry hospedado: o agente não tem leitura; recebimento contínuo não confirmado.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso estavam quebradas em agosto; não há registro de correção.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU com recálculo da sessão aberta.
- Itens desconhecidos registrados pelo Independente com foto.
- Inventory: cadastro manual, ativar/desativar e filtros na tela.
- Contagem por código de barras (até 3 por item).
- Padronização visual (PR #56 é só referência, não mergear).
