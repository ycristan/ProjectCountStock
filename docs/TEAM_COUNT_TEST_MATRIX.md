# Matriz de verificação — equipes

Referência: [contrato aprovado](./TEAM_COUNT_FLOW.md). Todos os cenários abaixo têm status **PLANEJADO / NÃO EXECUTADO** nesta entrega documental.
IDs são critérios de aceitação, NÃO testes automatizados já implementados.
PR = número ordinal do plano de nove entregas, não número GitHub.
Camadas: contratos puros + ações com autorização + Postgres/Auth real descartável + navegador/Realtime + migração/relatório. Implementar na PR indicada; repetir regressão nas dependentes.
Cada evidência futura deve conter ID, commit, execução, camada, resultado e limites; não transformar sucesso de build em sucesso funcional.

| ID | Regras | PR | Cenário | Resultado exigido |
|---|---|---|---|---|
| T01 | R01 | 3 | Criar equipes com 3, 4 e 5 pessoas | Quantidade de contadores N-1 e exatamente um independente; nomes/colunas/cartões dinâmicos |
| T02 | R01 | 2,3 | PINs novos e legados; PIN errado | Quatro dígitos preservados; acesso correto e erro seguro; nenhuma credencial real em logs |
| T03 | R01,R02 | 2,3 | Mesma marca em duas áreas/equipes e outra WHS | Equipe não acessa WHS errada; somatório entre equipes usa resultados oficiais |
| T04 | R02 | 2,3 | Contador chama API diretamente para ler outro contador | Negado no servidor/banco; monitor autorizado consegue acompanhar |
| T05 | R02 | 3 | Independente busca produto e tenta lançar inicial | Consulta permitida; gravação inicial negada fora de R09 |
| T06 | R03 | 4 | Solicitar finalização e tentar inserir/editar antes da resposta | Bloqueio imediato, inclusive chamada direta e tela antiga |
| T07 | R03 | 4 | Rejeitar pedido de um contador | Notificação sem campo motivo; somente ele liberado; novo pedido permitido |
| T08 | R03 | 4 | Aceitar um enquanto outro continua | Primeiro bloqueado; outro continua; não abrir conciliação prematuramente |
| T09 | R03 | 4 | Aceitar todos em ordens diferentes | Abrir conferência exatamente uma vez, sem admin intermediário |
| T10 | R04 | 4 | Quantidades iguais com métodos diferentes | Sem conciliação |
| T11 | R04 | 4 | 10/10/12 ou manual versus peso diferentes | Conciliação, sem maioria |
| T12 | R04 | 4 | Registro ausente versus zero explícito | Ausência exigida concilia; zero participa como quantidade válida |
| T13 | R04,R13 | 4,9 | Ninguém da equipe registrou um produto | Não inventar escopo físico; zero global só em R13 |
| T14 | R05 | 4 | Peso com BPU100: 50/100 e 49/100 | Primeiro pendente de escolha; segundo exige conciliação |
| T15 | R05 | 4 | Peso com três contadores: 50/75/100 e 50/100/150 | Comparar extremos, não diferenças entre vizinhos |
| T16 | R05 | 4 | BPU ímpar e BPU1 | Não arredondar limite para cima; diferença inteira1 com BPU1 fora da tolerância |
| T17 | R05 | 4 | Aceitar maior ou solicitar conciliação dentro da tolerância | Decisão explícita, autor registrado, não finalizar antes |
| T18 | R06 | 4 | Nenhuma divergência depois de todos aceitos | Independente ainda deve submeter explicitamente ao admin |
| T19 | R06 | 4 | Conciliação após recontagem física | Independente grava; originais preservados e rotulados; oficial único |
| T20 | R07 | 5 | Admin seleciona iguais, divergentes e conciliados da equipe | Todos selecionáveis; produto nunca contado por ela rejeitado |
| T21 | R07 | 5 | Rodadas sucessivas em subconjuntos | Somente selecionados pendentes; último valor oficial e histórico completo |
| T22 | R07 | 5 | Contador tenta editar durante devolução | Negado; independente registra e solicita nova aprovação |
| T23 | R07 | 5 | Dois admins aceitam/rejeitam simultaneamente | Uma transição consistente; nenhuma alteração silenciosamente perdida |
| T24 | R08 | 6 | Contador sai após parte dos produtos | Anteriores válidos, método/autoria mantidos; ausências futuras não cobradas |
| T25 | R08 | 6 | Credencial antiga do ausente tenta lançar/editar | Negado depois da saída registrada |
| T26 | R09 | 6 | Restam um contador + independente | Autorização admin exigida antes de substituir; vale qualquer tamanho original |
| T27 | R09 | 6 | Substituto conta produto já contado pelo ausente | Não duplica nem sobrepõe posição; novos itens com autoria do substituto |
| T28 | R09 | 6 | Pedidos individuais na exceção | Admin responsável aprova ambos; independente não aprova a própria finalização |
| T29 | R09 | 6 | Admin indica conciliação e tenta lançar quantidade | Pode indicar; gravação negada; independente concilia |
| T30 | R09 | 6 | Dois admins tentam assumir caso excepcional | Um responsável exclusivo até fim; outro somente acompanha; normal não ganha exclusividade |
| T31 | R10 | 7 | Independente de A designado também para B | Mesma conta, escolha de contexto e todas funções pendentes disponíveis |
| T32 | R10 | 7 | Mesmo produto em A/B e submissão de tela antiga | Equipe/rodada/autor corretos; nunca salvar no contexto errado |
| T33 | R10,R12 | 7,8 | Encerrar A enquanto substituto acompanha B | Vínculo A revogado; B permanece acessível |
| T34 | R10,R09 | 7 | Compartilhado tenta também virar contador | Bloquear até transferência de acompanhamento de uma equipe |
| T35 | R11 | 8 | Abrir coleta de equipe variável | Independente primeiro; demais crescentes; nome/desenho/SIGN BY PIN CODE |
| T36 | R11 | 8 | Confirmar com desenho ou PIN | Modalidade, participante, equipe e versão registradas; sem assinatura genérica |
| T37 | R11 | 8 | Cancelar coleta sem qualquer confirmação recebida | Permitido; não confundir início visual com assinatura salva |
| T38 | R11 | 8 | Cancelar/alterar após primeira confirmação | Negado inclusive admin; apenas concluir confirmações restantes |
| T39 | R11 | 8 | Contador ausente | Motivo e confirmação independente bastam; sem testemunha |
| T40 | R11 | 8 | Independente ausente | Motivo admin + testemunha identificada; sem isso permanece pendente |
| T41 | R10,R11 | 7,8 | Substituto e independente original ausente | Responsabilidades distintas identificadas; não atribuir assinatura a outra pessoa |
| T42 | R11,R12 | 8 | Falha ao salvar confirmação ou confirmação faltante | Sem encerramento falso; retomada sem duplicar confirmação |
| T43 | R12 | 8 | Todas confirmações/ausências válidas | Encerrar equipe e revogar somente seus vínculos; outras equipes continuam |
| T44 | R12 | 2,8 | Editar/excluir histórico após encerramento por qualquer caminho | Negado em ações/RPC/banco, inclusive admin e operações de limpeza |
| T45 | R12 | 8 | Sessão de acesso antiga e tela aberta após encerramento | Novas leituras/ações da equipe não autorizadas; interface atualiza sem alterar histórico |
| T46 | R13 | 9 | Ativo nunca contado, inativo nunca contado, inativo contado | Respectivamente zero, nenhuma linha, quantidade oficial |
| T47 | R13 | 9 | Status muda antes/depois do fechamento geral | Usar Status ao fechar; nenhuma alteração posterior no consolidado |
| T48 | R13 | 9 | Equipes contam mesma marca | Somar oficiais das equipes, nunca todos contadores ou versões antigas |
| T49 | R12,R13 | 8,9 | BPU/cadastro muda depois de equipe assinada | Não recalcular nem modificar resultado assinado/relatório fechado |
| T50 | R14 | 4,5,8 | Duplo clique, retry, desconexão e decisões concorrentes | Sem duplicação; notificação recuperável; servidor revalida etapa/versão |
| T51 | R14 | 3,7,9 | Navegador com vários perfis e Realtime | Atualização correta sem cruzar equipes; reconexão recupera estado |
| T52 | R14 | 9 | Falha de operação e Sentry | Erro correlacionado; não vazar PIN/assinatura/dados sensíveis; distinguir envio e recebimento |
| T53 | R14,R15 | 2,9 | Upgrade de banco com histórico sintético | Preservar dados/identidades/PINs/resultados; não converter sessão ativa silenciosamente |
| T54 | R14 | 3,4,9 | Inventory, solo, WHS, opcionais, peso e BPU1 | Sem regressões fora do fluxo; não aplicar zero automático ao solo |
| T55 | R15 | 9 | Sequência completa pela interface e relatório | Sem SQL privilegiado para saltar etapas; todos os resultados coincidem com versão assinada |

## Roteiros completos obrigatórios
1. Equipe sem divergências -> pedidos individuais -> aceite independente -> submissão explícita -> aceite admin -> confirmações -> revogação por equipe -> consolidado.
2. Divergência -> conciliação -> devolução seletiva admin -> segunda rodada -> nova submissão -> assinatura -> imutabilidade.
3. Peso dentro/fora da tolerância e métodos misturados -> decisão correta -> resultado oficial comprovado.
4. Saída parcial -> substituição autorizada -> admin exclusivo aprova pedidos -> independente concilia -> histórico preservado -> fechamento.
5. Independente compartilhado -> ação em duas equipes -> encerrar somente uma -> continuar outra.
6. Ausência em assinatura -> formalização correta -> nenhuma confirmação fictícia -> concluir equipe.

## Verificação documental desta PR
Conferir cobertura R01–R15, IDs únicos, nove entregas e links internos; revisão de leitura independente.
Nenhuma execução dos roteiros acima é alegada nesta PR. Testes anteriores da PR72 são evidência parcial de outro escopo, não aprovação destes contratos.

## Evidência parcial posterior — fundação, 2026-09-22
A PR #74 executou verificações de banco relacionadas a parte desta matriz: 46 novas asserções SQL e duas disputas concorrentes, além das regressões existentes. Evidência/limites em [TEAM_COUNT_FOUNDATION.md](./TEAM_COUNT_FOUNDATION.md).
Nenhum cenário ponta a ponta acima muda para concluído por inferência: comandos, telas, Auth/PIN do novo fluxo, Realtime e confirmação real ainda exigem suas verificações.

## Evidência parcial dos comandos individuais — 2026-09-22
T06/T07/T08/T09/T45/T50 agora têm evidência parcial adicional de RPC autorizado + Auth/PostgREST real no runner, não apenas alterações privilegiadas de fixture. Commit f8326fcdc89a96539e8d4051c79d81221762b786; execução 35731209411, aprovada.
34 novas asserções SQL, concorrência HTTP e revogação com sessão anterior. A UI e a comparação de itens ainda não estão ligadas; não marcar cenários ponta a ponta como concluídos.

## Evidência parcial de versões preservadas — 2026-09-22
Commit aad292839465853614831d64aeb084de8cd0f363, execução35735213309: 41 novas asserções (211 SQL total), Auth/PostgREST e regressões aprovados.
T04/T21/T37/T38/T44/T45/T49/T53 têm evidência adicional de armazenamento/RLS/seleção imutável e preservação de cadastro. Rodadas e assinaturas foram fixtures internas, NÃO ações reais pelo usuário; não marcar esses cenários completos.
BPU preservado foi testado contra edição do snapshot, não através de correção aprovada do cadastro após fechamento geral. Report/export consumidor continua pendente.
