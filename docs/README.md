# Memória compartilhada — Count Stock

Este diretório é a fonte de verdade de contexto para trabalho contínuo no Count Stock. Ele existe para que novas sessões do Codex e do Claude não recomecem do zero.

## Ordem de leitura
1. [Produto](./PRODUTO.md) — o que o app faz e quais regras de negócio não podem mudar por acidente.
2. [Estado atual](./ESTADO_ATUAL.md) — prioridade, riscos abertos e o que foi validado.
3. [Arquitetura](./ARQUITETURA.md) — componentes técnicos e limites importantes.
4. [Decisões](./DECISOES.md) — acordos que não devem ser rediscutidos a cada sessão.

## Como manter
- Atualize estes documentos junto com mudanças relevantes de produto, segurança ou arquitetura.
- Não armazene credenciais, PINs, tokens ou dados pessoais.
- O conteúdo histórico em `CLAUDE.md` e `.claude/memory/` é referência complementar; se houver conflito, estes documentos mais recentes prevalecem.


## Contagem por equipes — contrato aprovado, implementação em andamento
Antes de alterar contagem, identidade, permissões, reconciliação, assinaturas ou relatórios de equipes, ler:
1. [Contrato completo](./TEAM_COUNT_FLOW.md).
2. [Plano de nove entregas](./TEAM_COUNT_PLAN.md).
3. [Matriz de verificação](./TEAM_COUNT_TEST_MATRIX.md).
Estas regras prevalecem sobre descrições antigas. Aprovação do contrato não significa publicação. Não usar CLAUDE.md ou snapshots históricos para reintroduzir regras superadas.
