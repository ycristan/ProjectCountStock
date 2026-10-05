# Contagem por equipes — contrato aprovado

Aprovado por Yuri em 2026-09-21; revisado com Yuri em 2026-10-05 (R05, R08–R13; motivos em DECISOES.md).
Status: especificação; NÃO significa implementado, testado ou publicado.
Fonte normativa para o novo fluxo; prevalece sobre descrições antigas de contagem tripla, tolerância em gramas e encerramento conjunto.
Ver [matriz de verificação](./TEAM_COUNT_TEST_MATRIX.md) e [plano](./TEAM_COUNT_PLAN.md).
Alterações futuras exigem decisão explícita de produto; nomes de estados abaixo são conceituais, não um schema já escolhido.

## R01 — Equipes, pessoas e escopo
Admin escolhe WHS e número de equipes; tamanho variável por equipe, normalmente três pessoas, incluindo exatamente um independente responsável. Contadores da mesma equipe conferem o mesmo estoque físico, cegamente entre si. A divisão de corredores é pessoal, não cadastrada nem exigida pelo sistema. Produto fora de sua localização esperada pode ser contado dentro da WHS da sessão.
Brand Code pode aparecer em equipes diferentes por representar estoque físico em áreas distintas. Dentro da equipe comparar, não somar os participantes; entre equipes somar os resultados oficiais.
Separar identidade da pessoa, participação na equipe, papel e autoria da ação. Credenciais continuam PIN de equipe + PIN individual, ambos de quatro dígitos; nunca documentar valores reais. Permissões não vêm de user_metadata.

## R02 — Contagem inicial e monitor
Somente contadores lançam quantidades iniciais no fluxo normal. Independente consulta produtos, acompanha todas as colunas e alerta a equipe pessoalmente quando resultados divergem; não lança contagens iniciais.
Mostrar pendente quando falta registro; diferenças durante trabalho são alertas provisórios. Conciliação formal somente após aceitação de todas as finalizações exigidas.
Contagem cega precisa de proteção no banco e no servidor, não somente colunas escondidas. Admin acompanha mas NÃO lança contagem nem conciliação. Alertas e notificações devem sobreviver a desconexões.

## R03 — Pedido individual de finalização
Contando -> pedido enviado e imediatamente bloqueado -> independente aceita OU rejeita.
Aguardando e aceito: sem novos lançamentos ou edições. Rejeitado: notificação e liberação para contar/editar e pedir novamente.
Pedidos tratados individualmente, em momentos distintos. Não existe campo de motivo para rejeição normal; explicação pessoal.
Depois de todos os pedidos exigidos aceitos, comparar e liberar conciliação sem autorização intermediária do admin.
Na exceção R09, quem decide os pedidos individuais é o admin responsável, inclusive o pedido do independente substituto. (R09 adiado: sem efeito no primeiro lançamento.)

## R04 — Comparação
Comparar quantidades equivalentes convertidas em unidades. Zero explicitamente lançado é válido; ausência não é zero.
Ordem obrigatória:
1. Falta registro exigido para o item: conciliar.
2. Todos iguais: aceitar igualdade, mesmo com métodos distintos.
3. Diferentes e TODOS os registros exigidos por peso: R05.
4. Diferentes manuais ou métodos misturados: conciliar.
Maioria não resolve divergência. Se ninguém registrou o produto na equipe, o sistema não conhece sua presença física; não inventar pendência para todo o inventário.
As saídas/substituições de R08/R09 alteram os registros exigidos prospectivamente, não invalidam quantidades anteriores.

## R05 — Tolerância por peso (revisada em 2026-10-05)
Guardar método de cada lançamento. Tolerância proporcional à quantidade, não ao BPU.
Com todos os registros exigidos por peso: diferença entre máximo e mínimo ≤ limite, onde limite = maior entre 1 unidade e 2% do maior valor, arredondado para baixo.
Exemplos: 100/98 dentro (limite 2); 100/97 fora; 30/29 dentro (limite 1); 30/28 fora; 1000/980 dentro (limite 20); 1000/979 fora.
Dentro: Independente escolhe explicitamente QUAL dos valores registrados é o oficial, ou pede conciliação. Sem média, maioria ou aceite automático; sem preferência pelo maior. Até a decisão, item pendente.
Fora: conciliação obrigatória. Ausência não pode ser absorvida pela tolerância.
Fórmulas de tara e conversão permanecem; a regra muda só a comparação.

## R06 — Conciliação e submissão
Independente abre card do item, confere fisicamente com a equipe e registra resultado. Reutilizar formulário e regras de Pallets/Cases/Units/peso.
Originais permanecem visíveis, com rótulo de substituição e aparência opaca/vermelha; coluna do independente mostra conciliação, única quantidade oficial daquela rodada/item.
Independente solicita explicitamente finalização da equipe, inclusive sem qualquer divergência.
Não submeter com pendência de comparação, tolerância ou conciliação. Submeter gera notificação recuperável ao admin.

## R07 — Revisão do admin e recontagens
Admin aceita ou devolve selecionando um ou mais itens EFETIVAMENTE CONTADOS pela própria equipe. Inclui iguais ou já conciliados. Não incluir produto que a equipe nunca contou.
Devolução não libera contadores. Independente registra recontagens, com ajuda física da equipe.
Cada rodada mantém itens, solicitante, responsável, ordem e resultados. Novo valor substitui oficial anterior sem apagar histórico. Itens não selecionados permanecem preservados.
Resolvida a rodada, independente solicita novamente; admin aceita/rejeita. Sem limite artificial de rodadas antes de assinatura.
No fluxo normal ambos os admins atuam; decisões conflitantes simultâneas devem ser impedidas.

## R08 — Contador ausente (simplificada em 2026-10-05)
Se um contador sai e não volta, o Independente marca-o como ausente e informa o motivo; o admin é notificado. Acesso de lançamento/edição revogado.
Contagens já feitas continuam válidas, com autoria e método. Produtos que ele não contou deixam de exigir a contagem dele. Nunca apagar contagens do ausente.
O ausente conta como finalizado para abrir a conciliação; na assinatura vale a ausência formalizada (R11).

## R09 — Independente como contador substituto — ADIADO
Fora do primeiro lançamento (02/01/2027). Sem substituição de contador.

## R10 — Independente compartilhado — ADIADO
Fora do primeiro lançamento. Cada equipe tem seu próprio Independente.

## R11 — Assinaturas e ausências
Admin aceita resultados e inicia coleta, sem lançamento de quantidades.
Exibir independente primeiro, depois contadores em ordem crescente. Cada bloco: nome completo e botão SIGN BY PIN CODE. Assinatura desenhada (dedo/caneta) é melhoria futura, fora do primeiro lançamento. Não adicionar seleção prévia obrigatória de pessoa pelo admin.
Confirmar por PIN; registrar modalidade, pessoa, equipe, momento e versão dos resultados. Não criar imagem de assinatura genérica.
Contador ausente: independente registra motivo e confirma formalmente, SEM testemunha.
Independente ausente: admin formaliza motivo e testemunha identificada (outro contador ou admin) assina.
Ausência formalizada substitui confirmação daquele participante e não bloqueia encerramento indefinidamente. Não disfarçar ausência como assinatura pessoal.
Antes de qualquer assinatura/PIN/confirmação substitutiva recebida, admin pode cancelar coleta. A primeira confirmação válida congela o processo: sem cancelar coleta, reabrir conciliação ou alterar resultados; apenas completar confirmações restantes.
Falha de salvamento não equivale a confirmação recebida. Todos confirmam a mesma versão.
Distinguir papéis/participações originais e substitutos; preservar quem contou, quem substituiu e quem confirmou sem inventar assinatura do ausente.

## R12 — Encerramento por equipe
Todas as confirmações exigidas recebidas, incluindo ausências formalizadas: encerrar equipe, fixar resultados e revogar seus acessos como uma conclusão consistente.
Equipes encerram em momentos diferentes. Não aguardar as demais para proteger os resultados da equipe encerrada.
Após encerramento, dados TOTALMENTE IMUTÁVEIS: contagens, versões, conciliações, assinaturas e histórico. Nem admin altera/exclui/reabre.
Proteger servidor, banco, chamadas diretas, credenciais já emitidas e telas antigas. Logout/ocultar botão não é proteção suficiente.
Não excluir contas/dados para revogar. R10 preserva acessos às outras equipes. A primeira confirmação já bloqueia mudanças conforme R11, antes da revogação definitiva.
Correção posterior (revisado em 2026-10-05): o resultado assinado nunca é editado. Erro descoberto depois vira um AJUSTE separado, registrado por dois admins com motivo, visível no relatório e no Audit Count. Fora do primeiro lançamento.

## R13 — Consolidado final por WHS
Depois de todas as equipes encerradas, somar resultados oficiais preservados. Nunca somar contadores da mesma equipe.
No fechamento geral, considerar Status do inventário naquele momento:
- ativo não contado por NENHUMA equipe: listar para o admin antes do fechamento ("ativos não contados"); zero só depois de o admin confirmar, em lote ou item a item, ou mandar contar;
- inativo não contado por nenhuma: não gerar registro, nem zero;
- item contado, inclusive inativo: incluir resultado oficial, inclusive zero explícito.
Congelar consolidado. Mudança posterior de Status, BPU, nome ou cadastro não altera resultado/relatório fechado; fechamento geral não recalcula contagem assinada de equipe.
Não confundir essa regra com ausência individual em R04. Regras são exclusivas do fluxo de equipes; não aplicar zero automático ao solo.

## R14 — Garantias transversais
Cada operação valida identidade protegida, equipe/WHS, participação, etapa e versão. Requisições repetidas não duplicam resultados.
Notificações recuperadas ao reconectar; eventos ao vivo não são única fonte de estado.
Registrar eventos de negócio (autor/ação/equipe/rodada/versão) separadamente de erros técnicos. Logs/Sentry sem PINs, assinaturas ou conteúdo pessoal sensível.
Manter BPU >= 1, Pallet/Weight opcionais, bloqueios de métodos indisponíveis, Units/peso permitido com BPU 1 conforme decisões existentes, importação e solo sem regressão.
Resultados assinados não são alterados por qualquer fluxo existente de inventário/BPU/limpeza/admin.

## R15 — Implementação e autorização
Separar especificação aprovada de comportamento atualmente publicado. PR72 contém correções parciais; não prova este fluxo e não tem merge automaticamente autorizado.
Mudanças por conectores/API no GitHub, sem clone/arquivos/segredos do projeto no Windows. Testes descartáveis remotos; Preview compartilha produção, sem escritas de teste nele.
Nenhum merge/migration em produção está autorizado pela aprovação do plano.
Não migrar sessões em andamento silenciosamente; testar compatibilidade e definir janela de ativação antes de publicar.
Inventário/manual/toggle, aprovação dupla BPU e outros backlogs não viram entregas concluídas por este pacote.

## Não repetir erros anteriores
- Não validar somente caminhos com chamadas privilegiadas diretas pulando botões/autorizações.
- Teste de contrato com mocks não substitui banco real, navegador, Realtime ou teste de revogação.
- Build verde não prova fluxo de negócio; lista de cenários não é execução.
- Não acrescentar regra presumida como aprovada. Lacunas de produto realmente novas são registradas e resolvidas antes do caminho afetado, sem repetir perguntas já respondidas.
