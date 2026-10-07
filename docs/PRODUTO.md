# Produto — Count Stock

## Objetivo
Contagem física de estoque por warehouse, com responsabilidades separadas, conferência e resultados preservados. Primeira contagem real (2026-07-08): contagem + reconciliação em 1 dia, contra ~10 h + 1 semana do processo manual.

## Usuários
- **Administrador:** importa inventário, cria sessões e equipes, acompanha, aceita resultados, consolida e administra o solo. Nunca lança contagem.
- **Contadores:** contam às cegas, sem ver a contagem dos colegas.
- **Independente:** monitora a equipe, decide pedidos de finalização e registra a conciliação.
- **Contador solo fixo:** conta sessões solo atribuídas, com lista de itens opcional, e encerra a própria sessão.

## Fluxo publicado hoje (legado de equipes)
Equipe fixa de três: Contador 1, Contador 2 e Independente. C1 e C2 contam; divergências viram itens de reconciliação; o Independente resolve; o admin combina as equipes e encerra a sessão.

## Novo fluxo de equipes — aprovado em 2026-09-21, em implementação (não publicado)
Fonte normativa: [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md). Resumo, sem substituir o contrato:
- Equipes de tamanho variável, contadores cegos entre si e um Independente; áreas divididas fisicamente, não no sistema.
- Independente consulta e monitora; não conta, salvo substituição autorizada.
- Contador pede finalização e fica bloqueado; Independente aceita ou rejeita cada pedido. Rejeição libera, sem campo de motivo.
- Depois dos aceites, conciliar ausências e divergências. Valores iguais por qualquer método dispensam conciliação. Todos por peso: diferença de até 2% (mínimo 1 unidade) exige decisão explícita do Independente (escolher um dos valores ou conciliar).
- Independente submete a equipe. Admin aceita ou pede recontagem só de produtos contados pela equipe.
- Assinatura por PIN com nome completo, ou ausência formalizada; a primeira confirmação congela; a última encerra a equipe e revoga seus acessos. Contador que sai é marcado ausente pelo Independente (sem substituição).
- Antes do fechamento geral, o admin dá ciência da lista de ativos não contados (não encontrados); no Excel eles saem com 0 e a marcação "não contado".
- Equipes encerram separadamente e ficam imutáveis; correção posterior só por ajuste com dois admins (após o primeiro lançamento). No consolidado: inativo não contado não gera linha.

## Regras gerais
- Itens com histórico nunca são apagados: saem da planilha → ficam inativos.
- Um contador não vê nem altera a contagem de outro.
- Sessão fechada não aceita novas contagens. Resultado fechado não é recalculado por mudança de cadastro.
- Exibição de quantidade sempre `cases+units` (ex.: `10+21`), sem rótulos.
- Contagem por peso desconta a tara das caixas e converte em unidades pelo peso médio.
- BPU ≥ 1. Com BPU 1, Cases/Pallets ficam desativados; Units e peso (se Weight Avg > 0) continuam.
- Inventário por warehouse: ver [INVENTORY_WAREHOUSES.md](./INVENTORY_WAREHOUSES.md).
- Solo não segue as regras do novo fluxo de equipes (sem zero automático).
