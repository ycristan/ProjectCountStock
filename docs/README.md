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
