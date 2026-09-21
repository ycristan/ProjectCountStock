# Produto — Count Stock

## Objetivo
Contagem física de estoque por warehouse, com responsabilidades separadas, conferência e resultados preservados.

## Fluxo de equipes aprovado em 2026-09-21
Fonte completa: [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md). Plano aprovado não significa funcionalidades publicadas.
- Equipes variáveis, contadores cegos entre si e um independente responsável; áreas distribuídas fisicamente.
- Independente consulta/monitora; não conta inicialmente, salvo substituição autorizada.
- Contador solicita finalização e fica bloqueado; independente aceita/rejeita individualmente. Rejeição libera, sem campo de motivo.
- Depois dos aceites, conciliar ausências/divergências; iguais por qualquer método dispensam conciliação. Todos por peso: tolerância de metade do BPU com decisão explícita do independente.
- Independente submete equipe, mesmo sem divergências. Admin aceita ou pede recontagem somente de produtos contados pela equipe; nunca registra quantidades.
- Assinaturas/PIN ou ausências formalizadas; primeira confirmação impede cancelamento/alteração; todas recebidas encerram equipe e revogam seus vínculos.
- Equipes encerram separadamente e ficam imutáveis. Consolidado geral usa Status no fechamento: ativo não contado gera zero; inativo não contado não gera linha.
- Saídas preservam anteriores. Exceção de substituição tem admin exclusivo; independente compartilhado mantém acessos por equipe. Detalhes obrigatórios no contrato, não inferir pelo resumo.

## Outros módulos preservados
Admin importa inventário, configura sessões e administra solo. Contador solo fixo recebe atribuições e encerra sua sessão; as novas regras de equipe não autorizam alterar solo.
Itens com histórico não são apagados. Formato de quantidade: cases+units. Peso desconta tara e converte em unidades. BPU >= 1; BPU 1 desativa Cases/Pallets, mantendo Units e peso quando Weight Avg > 0, conforme decisões aprovadas.
Ver [Inventory/Warehouses](./INVENTORY_WAREHOUSES.md), [decisões](./DECISOES.md) e [estado](./ESTADO_ATUAL.md) para diferenças entre especificação e publicação.
