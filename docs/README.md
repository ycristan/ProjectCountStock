# Memória do projeto — Count Stock

Fonte única de contexto para Claude e Codex. Regras de uso em [AGENTS.md](../AGENTS.md#memória-do-projeto).

| Documento | Conteúdo | Como muda |
|---|---|---|
| [ESTADO.md](./ESTADO.md) | Em que pé está, próximo passo, pendências de Yuri | Reescrito a cada PR (máx. 40 linhas) |
| [PRODUTO.md](./PRODUTO.md) | O que o sistema faz e regras de negócio gerais | Só com aprovação de Yuri |
| [DECISOES.md](./DECISOES.md) | Decisões tomadas e o motivo | Só acréscimos |
| [ARQUITETURA.md](./ARQUITETURA.md) | Componentes, fórmulas e armadilhas técnicas | Quando a arquitetura muda |
| [INVENTORY_WAREHOUSES.md](./INVENTORY_WAREHOUSES.md) | Contrato de inventário, importação e warehouses | Só com aprovação de Yuri |
| [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md) | Contrato do novo fluxo de equipes (R01–R15) | Só com aprovação de Yuri |
| [TEAM_COUNT_PLAN.md](./TEAM_COUNT_PLAN.md) | Ordem de implementação do fluxo de equipes | Quando o plano muda |
| [TEAM_COUNT_TEST_MATRIX.md](./TEAM_COUNT_TEST_MATRIX.md) | Cenários de aceitação T01–T55 | Quando o contrato muda |

Precedência em caso de conflito: contratos aprovados > DECISOES > PRODUTO > demais. Estado real (PRs, migrations, deploy) vem sempre dos conectores.
