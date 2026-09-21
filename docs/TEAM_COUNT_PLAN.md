# Plano aprovado — nove entregas de equipes

Aprovação de implementação: Yuri, 2026-09-21. Sem autorização de merge ou mudança de produção.
Contrato: [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md). Aceitação: [TEAM_COUNT_TEST_MATRIX.md](./TEAM_COUNT_TEST_MATRIX.md).
Números abaixo são ordinais do plano, não números de PR no GitHub.

| Entrega | Escopo | Critério de saída |
|---|---|---|
| 1 | Especificação, memórias e matriz de permissões/testes | Contratos aprovados rastreáveis, contradições antigas marcadas, revisão documental; sem alegar testes funcionais |
| 2 | Pessoas/vínculos, N participantes, autoria, etapas, histórico, permissões e compatibilidade | Migração preserva histórico; banco impede acessos e transições inválidos; casos de upgrade testados |
| 3 | Cadastro variável, PIN/cartões, busca consultiva e monitor | Equipes 3/4/5, contagem cega e WHS isolada, alertas e notificações recuperáveis |
| 4 | Pedido individual, bloqueio imediato, aceite/rejeição, comparação e conciliação | Ausência/zero/igualdade/divergência/métodos/tolerância e submissão sem discrepância testados |
| 5 | Aceitação admin e recontagens seletivas | Somente produtos contados da equipe; versões preservadas e pendências bloqueiam aceite |
| 6 | Saídas parciais, independente substituto, admin exclusivo | Anteriores preservados, novos ausentes dispensados; substituição não duplica posição; admin nunca conta |
| 7 | Independente compartilhado | Autor/equipe corretos, revogação por vínculo, prevenção de acúmulo incompatível |
| 8 | Assinatura/PIN/ausência, fechamento e imutabilidade | Limite da primeira confirmação, provas completas antes de encerrar, todos os caminhos protegidos |
| 9 | Consolidado/Excel/observabilidade e verificação ponta a ponta | Ativos/inativos corretos, relatórios assinados fiéis, navegador/Realtime/upgrade/regressões aprovados |

## Dependências e ativação
Ordem: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9. Cada entrega inclui seus testes; a última integra, não inicia a validação.
Trabalhar em branches dependentes/linha de integração isolada, sem liberar partes incompletas na main. PRs são unidades de revisão, não nove ativações incompletas.
Rever PINs e identidade da PR72 para aproveitar correções com rastreabilidade. Não publicar automaticamente PR72, não contar como décima entrega e não importar testes com expectativa de negócio antiga.
Antes de ativar: verificar estado real do banco/branches, compatibilidade com legado, snapshot/recuperação, migração em cópia sintética, sessões ativas e janela aprovada. Não redesenhar solo/inventário fora do necessário nem modificar resultados assinados.
Se coexistência temporária for necessária, especificar explicitamente versões e roteamento; não manter dois fluxos completos indefinidamente por conveniência.

## Limites técnicos a resolver na entrega 2
- Modelar pessoa versus participação para permitir N contadores e independente compartilhado sem duplicar identidade.
- Modelar cadeia de substituição por posição/item, preservando autoria/método anteriores. Registro anterior prevalece naquela posição; substituto preenche só faltantes.
- Estados individuais e equipe separados; encerramento equipe não depende do geral.
- Conferir método por lançamento e unidades canônicas para comparação; sem tolerância em gramas.
- Proteger imutabilidade também de operações privilegiadas/importação/BPU/limpeza.
- Definir recuperação técnica de falhas sem inventar reabertura após primeira assinatura.
Esses itens são trabalho técnico, não convite para pedir novamente regras já aprovadas. Qualquer nova decisão de produto real deve ser distinguida antes de implementar.

## Ponteiros de diagnóstico (inspeção do código, não prova de execução)
Base main inspecionada: 8eac774b0eaf5192477a20940bf237a28a397589.
- supabase/migrations/001_schema.sql: enum e unicidade por papel fixos; contagens/reconciliação estruturadas em C1/C2.
- actions/sessao.ts e formulário de equipes: criação com papéis fixos; confirmarIndependente separado da conciliação.
- actions/finalizacao.ts: finalização individual não representa aceite/rejeição pelo independente.
- supabase/migrations/017_tolerance.sql: compara C1/C2 e tolerância em gramas; novo contrato R05 substitui.
- app/(counter)/monitor/_components/MonitorClient.tsx: fluxo atual envia admin para verificar divergências.
- app/(counter)/reconciliacao/_components/ReconciliacaoCounterClient.tsx: assinatura Realtime depende de team_id em user_metadata; corrigir escopo protegido.
- actions/reconciliacao.ts: operação privilegiada exige reforço de etapa/fechamento; não basta autorização por papel.
- app/api/sessao/[id]/export/route.ts: colunas fixas e nomes lidos de metadata; relatório precisa de participantes e resultados preservados.
- PR72 corrige parte da identificação, PINs e bloqueio de contagem inicial, mas bloqueio total de busca independente não atende R02; seu teste não prova nove entregas.
Rever esses pontos no commit efetivo de cada implementação; não inferir que produção já foi atualizada.

## Qualidade e Ponytail
Reutilizar formulário de quantidade; uma comparação e uma fonte de resultado oficial; conciliação inicial e recontagem usam o mesmo mecanismo com rodada/origem.
Não adicionar contador_3, contador_4 etc. como novas colunas/papéis especiais. Não criar framework genérico de workflow ou serviço de notificações separado sem necessidade.
Menos código não justifica retirar autorização, histórico, testes ou observabilidade.
Não declarar redução de linhas/dependências sem diff mensurável; esta entrega altera documentação apenas.

## Operação
Conectores/API primeiro. Nenhum clone/arquivo/segredo do projeto no Windows. Testes com dados sintéticos em runners remotos.
Preview compartilha produção: não executar gravações de teste ali.
Erros correlacionados sem PIN/assinaturas nos logs. Notificações de negócio persistem no estado; reconexão recupera pendências.
Após aprovação do plano, seguir trabalho técnico sem solicitar um "continue" a cada etapa. Parar para autorização de produção, custo, acesso indispensável ou nova decisão de negócio não documentada.
