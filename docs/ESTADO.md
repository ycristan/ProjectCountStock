# Estado — 2026-10-05

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Em produção
`main` com inventário por warehouse, ZIP e recuperação BDS aplicada. Fluxo de equipes publicado ainda é o legado de três pessoas.

## Em andamento
- Limpeza do repositório: memória única (PR #76) e PRs obsoletas fechadas (#56, #68, #71, #72, #73). Sobras de código removidas nesta PR.
- 74 branches obsoletas aguardam remoção: o ambiente do agente bloqueia apagar branch remota; precisa de permissão de Yuri ou remoção pelo GitHub.
- Novo fluxo de equipes: blocos 1–4 prontos na PR #74 (rascunho), não publicados. Antes do bloco 5: tirar dela o laboratório Codespace e os documentos de memória antigos.

## Decisões pendentes de Yuri
1. Regressão do Independente (vinda da PR #63): segundo a PR #72, contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção existe na #74, não publicada, não reverificada em produção. Há uma sessão de equipes aberta desde 01/10, ainda sem equipes. Decidir: publicar a correção isolada antes da próxima contagem real?
2. Revisar as regras pré-aprovadas com o agente.
3. Ativar no GitHub "Automatically delete head branches".

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
- Padronização visual (referência: PR #56 fechada).
