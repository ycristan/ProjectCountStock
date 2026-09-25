# Equipes — blocos curtos de execução
Refinamento aprovado em 24/09/2026. Preservar TEAM_COUNT_FLOW.md e matriz T01–T55; não substituir regras.
Cada bloco inclui implementação, testes proporcionais e registro com commit/execução/limites. Um bloco por execução; não publicar partes incompletas em produção.

1. Atualizar base com inventário — CONCLUÍDO, código 8674f212575e89454b8ad5dd841728be658063ce, execução 36014137956 aprovada (404 verificações + integrações).
2. Confirmação confiável no monitor — CONCLUÍDO na branch, código 69c65e2541c282900555d6150aba239d0c26311d, execução 36108456295 aprovada; falhas/retry/reload testados no navegador. Sem publicação.
2A. Lista delimitada Solo — seleção mostra Active/Inactive como a busca de contagem, ambos selecionáveis; padrão existente reutilizado. CONCLUÍDO na branch, código cbfbba839053345ba8313af1cd0686284f497bf0, execução 36113867343 aprovada; >8 resultados, WHS, seleção/remoção/reinclusão e resumo comprovados no Chromium. Sem publicação.
3. Cadastro variável — 3/4/5 participantes, PINs de quatro dígitos, um Independente. EM ANDAMENTO.
   - 3A: builder transacional privado, vínculos/posições e retry. Em validação; sem UI/Auth ativados.
   - 3B: provisionamento Auth recuperável, integração do formulário, PIN/cartões e teste real. PENDENTE.
4. Contagem e monitor no modelo novo — cegueira, WHS, autoria, Realtime e reconexão.
5. Finalização individual nas telas — pedido, bloqueio, aceite/rejeição.
6. Comparação — igualdade, ausência/zero, métodos e tolerância de peso.
7. Conciliação — registro independente, originais e submissão explícita.
8. Revisão admin — recontagens seletivas e rodadas preservadas.
9. Saídas/substituição — anteriores válidos, autoridade excepcional.
10. Independente compartilhado — contexto e acessos separados.
11. Assinaturas — desenho/PIN/ausências, congelamento na primeira confirmação.
12. Encerramento/relatório — revogação por equipe, consolidado e fluxo completo.

## Comunicação obrigatória de teste
Sempre declarar se Yuri precisa testar. Quando necessário: TESTE MANUAL NECESSÁRIO, link exato/ambiente, acesso, passos, resultados esperados e cuidados. Quando não: Nenhum teste manual necessário neste bloco.
Preview compartilha produção: não realizar nem pedir escritas de teste nele. Testes técnicos com dados sintéticos no runner descartável.
Blocos 1, 2 e 2A não exigem teste manual; verificações automatizadas no runner. Próximo bloco: 3.
