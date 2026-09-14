# Inventory e Warehouses — regras para revisão

Consolidado em 2026-09-14 a partir das decisões de Yuri na conversa do projeto.
Este documento descreve o comportamento desejado, não uma implementação já disponível.
As regras abaixo substituem propostas anteriores conflitantes na próxima implementação. A PR #65 não deve ser aproveitada por merge.

## 1. Um módulo Inventory

Unificar Upload Inventory e View Inventory: listar, pesquisar, editar em linha, criar um produto manualmente, importar e baixar a planilha.
Disponibilizar filtros por Brand Code, nome, categoria, estado e BIN; manter o cabeçalho visível durante a rolagem.
Ativação/desativação manual por toggle. Download sempre do inventário completo, incluindo ativos e inativos.

## 2. Cadastro e métodos de contagem

| Campo | Regra |
| --- | --- |
| Brand Code | Obrigatório e único em toda a aplicação, inclusive entre warehouses e itens inativos. Tratar como texto, preservando zeros iniciais. |
| Brand Name | Obrigatório. |
| Category | Obrigatório. |
| Category 1 | Obrigatório. |
| BPU | Obrigatório; mínimo 1, nunca zero. |
| Pallet Size | Opcional. Vazio ou zero impede contagem por pallets. |
| Weight Avg (W. AVG g) | Opcional. Vazio ou zero impede contagem por peso. |
| BIN | Pode estar vazio, inclusive para item inativo; preservar suporte atual a até quatro localizações. |
| Status | Nova coluna obrigatória da planilha: TRUE = Active; FALSE = Inactive. |
| WHS | Identifica a warehouse do produto na nova planilha. |

BPU = 1 desativa Cases e Pallets, mas permite Units e contagem por peso quando Weight Avg for maior que zero.
As restrições devem valer também no servidor, não apenas nos botões.

Ao digitar Brand Code no cadastro manual, mostrar códigos/produtos existentes que correspondam à sequência digitada, incluindo inativos. Se o código existir, editar/reativar o cadastro existente; nunca criar outro.
A sugestão visual não substitui a restrição de unicidade no banco, inclusive em cadastros simultâneos.

## 3. Upload e download

Brand Code é a chave para comparar a planilha com o inventário:
- Código existente: atualizar os campos com os valores da planilha.
- Código novo: criar o item.
- Pallet Size ou Weight Avg vazio/zero: substituir o valor antigo e desativar o método correspondente. Não preservar o valor antigo.
- Linha presente: aplicar seu Status, inclusive FALSE.
- Código ausente: a regra acordada é torná-lo inativo; isso se aplica somente à warehouse identificada no arquivo. As demais não são alteradas.
- Preservar os históricos de contagem; desativação não é exclusão.

Se houver Brand Codes repetidos na planilha, interromper antes de gravar qualquer alteração. Mostrar em popup todas as linhas conflitantes e exigir que o administrador escolha qual manter para cada código. Nunca escolher automaticamente ou aceitar duplicatas.

A nova planilha deve incluir Status e WHS. O formato antigo deixa de ser aceito quando a nova implementação entrar em vigor, conforme decisão de Yuri.
O download completo será um ZIP com uma planilha por warehouse, incluindo ativos e inativos e as colunas Status e WHS. Cada planilha deve ser reutilizável no upload sem reativar involuntariamente itens inativos.
Nomes exatos dos demais cabeçalhos e formatos aceitos devem ser consolidados em um único modelo de importação/exportação.

## 4. Busca e inventário ao vivo

Durante uma contagem, buscar tanto produtos ativos quanto inativos da warehouse da sessão.
Mostrar um grupo Active primeiro, com verde suave; depois Inactive, com vermelho suave. Usar títulos/labels, sem depender apenas da cor.
Ambos podem ser selecionados e contados. Não acrescentar bloqueio ou confirmação obrigatória para inativos sem decisão de produto.

Exemplo: busca Coca-Cola mostra produtos ativos correspondentes acima e Coca-Cola Vanilla inativa abaixo.

O administrador pode criar, editar ou reativar produtos durante uma sessão. Um produto novo deve ficar disponível nas contagens ativas de inventário completo da sua warehouse, exceto nas listas fechadas já iniciadas.
Yuri exige aplicação viva: resultados chegam em tempo real aos administradores; alterações de inventário devem se refletir para os contadores, no mínimo após atualização da tela. A atualização automática é a direção desejada.
Lista fechada: após iniciar a contagem, não incluir produtos, nem automaticamente nem por ação manual do administrador. O cadastro no inventário continua permitido, sem alterar essa lista.

## 5. BPU durante contagens

Regra geral: não alterar BPU durante contagem.
- Em sessão de equipes, uma correção excepcional exige concordância de dois administradores da sessão, cada um validando sua própria senha.
- Em sessão solo ativa, alteração totalmente bloqueada.
- Importação de planilha também deve respeitar essa proteção: não pode contorná-la.

Não registrar senhas em logs, relatórios ou documentos. A implementação deve verificar duas identidades distintas e permissão no servidor.
Correção aprovada por dois administradores recalcula as contagens já registradas do produto na sessão em andamento, sem exigir nova contagem física. Preservar quantidades originais informadas: 20 Cases com BPU 20 = 400 Units; corrigindo para BPU 24, os mesmos 20 Cases = 480 Units. Sessões futuras usam o BPU corrigido. Sessões encerradas têm dados e resultados imutáveis; não recalcular nem alterar seus resultados. Registrar duas identidades aprovadoras, BPU anterior/novo e data da correção, nunca senhas. A proteção existente de sessões fechadas ainda precisa de verificação integral no código e banco.

## 6. Warehouses

Hoje há Main Warehouse e Service Warehouse, mas o sistema não deve limitar a quantidade a duas.
Uma planilha por warehouse, com coluna WHS obrigatória e o mesmo warehouse em todas as linhas. Arquivo com warehouses diferentes deve ser bloqueado antes de gravar. O sistema identifica o destino pela coluna e mostra ao administrador qual warehouse será atualizada.

Ao criar uma sessão, o administrador escolhe uma warehouse. Seus contadores só podem acessar produtos daquela warehouse, inclusive na busca por nome, código e BIN.
Brand Code continua globalmente único. Localizações podem ter nomes iguais em warehouses diferentes: buscar 40B numa sessão Main não deve mostrar um produto Service.

Aprovado por Yuri: manter cadastro dinâmico de warehouses alimentado pelo upload. Warehouse conhecida atualiza somente seu inventário; nome novo exige confirmação explícita do administrador antes da criação, evitando cadastros por erro de digitação. Cancelar não altera dados. Main e Service são os primeiros cadastros, não valores fixos no código. Terceira, quarta e demais warehouses não exigem mudança de código.
Usar identificação interna estável separada do nome exibido: renomear não perde produtos, vínculos ou histórico.
Comparar nomes de WHS ignorando maiúsculas/minúsculas e espaços nas pontas: `Main`, `MAIN` e ` Main ` identificam a mesma warehouse.
Transferência de produto: bloquear se houver sessão ativa na origem ou destino; permitir fora dessa condição. Yuri aceitou essa restrição por enquanto, sujeita a revisão futura. Upload também não pode contorná-la.
Migração: todos os produtos e sessões existentes, inclusive encerradas, pertencem à Main Warehouse. Associar essa identificação preservando resultados e histórico; não existem itens Service atualmente. Essa associação inicial não autoriza alterações posteriores dos resultados fechados.
O isolamento deve ser validado no servidor e no acesso aos dados, não apenas no filtro visual.

## 7. Item desconhecido

Somente o Contador Independente pode registrar.
Fluxo:
1. Contador encontra produto não cadastrado e avisa o Independente.
2. Independente confere com o administrador.
3. Se o administrador também não conhece o produto, Independente registra a ocorrência.
4. Tela 1: foto obrigatória.
5. Tela 2: detalhes quando disponíveis, como nome, localização e observações.
6. Tela 3: quantidades encontradas em Pallets, Cases e Units; confirmar.

Registrar quantidades como informadas, sem inventar BPU ou conversões. A ocorrência pertence à warehouse da sessão.
É uma formalidade para possível inclusão no relatório final, sujeita à validação administrativa. Não exige um fluxo complexo de criação/associação automática de produto.
Detalhes de apresentação, descarte e inclusão no relatório ainda precisam ser especificados.

## 8. Verificações técnicas antes de implementar

As sete dúvidas anteriores foram respondidas por Yuri e incorporadas acima. Não voltar a tratá-las como decisões em aberto.
- Verificar imutabilidade de sessões fechadas em todos os caminhos de gravação e relatório.
- Mapear cálculo por peso, reconciliação e resultados combinados para que correção de BPU não reinterprete unidades derivadas de peso como Cases físicos.
- Definir tecnicamente o marco de início da lista fechada e proteger inclusões concorrentes.
- Verificar efeito de sessões simultâneas sobre correção de BPU; não contornar o bloqueio de solo ativo nem aplicar correções a outra sessão sem a autorização exigida.
- Detalhes de apresentação/validação do item desconhecido no relatório ainda serão especificados na etapa própria.

## 9. Plano técnico proposto e critérios de aceitação

Implementar em PRs menores, após fechar as pendências relevantes:
1. Modelo de warehouses e novo formato de planilha; validação integral e atualização transacional.
2. Inventory unificado, cadastro manual, filtros e toggle.
3. Sessões por warehouse, busca Active/Inactive e atualização do inventário.
4. Proteção de BPU com aprovação dupla.
5. Ocorrência de item desconhecido com foto e relatório.

Validar no banco e servidor:
- BPU zero rejeitado; campos opcionais vazios aceitos.
- Duplicatas e tentativas simultâneas não criam dois produtos.
- Importação inválida ou cancelada não altera parcialmente o inventário.
- Download/reupload preserva Status e WHS.
- Upload Main não altera Service nem outras warehouses; itens ausentes são inativados somente na warehouse do arquivo.
- Arquivo com WHS misturadas é rejeitado sem gravações; warehouse nova exige confirmação e fica disponível para sessões.
- Renomear warehouse preserva seus vínculos e histórico.
- BIN igual em warehouses distintas não causa vazamento entre sessões.
- Inativo continua contável; criação durante sessão respeita warehouse e permissões.
- Upload não contorna bloqueio de BPU; aprovação usa dois administradores distintos.
- Apenas Independente registra desconhecido, sempre com foto.
- BPU 1 permite peso positivo, desabilitando Cases/Pallets.
- Correção dupla converte 20 Cases de 400 para 480 Units sem nova contagem; resultados fechados não mudam.
- Lista fechada iniciada rejeita inclusão manual/automática, inclusive por chamada direta.
- Transferência é bloqueada durante sessão ativa na origem ou destino, inclusive via upload.
- Migração associa registros existentes a Main sem mudar resultados; normalização de WHS não cria duplicatas.
- ZIP contém uma planilha reutilizável por warehouse.
- Contagens existentes e modalidades solo/equipes continuam preservadas.

As verificações acima são planejadas; não foram executadas nesta PR documental.

## Conferência inicial do código — 2026-09-14

Leitura estática pontual, não auditoria completa nem teste executado:
- `actions/contagem.ts:carregarInventario` filtra `brand_active = true` e não recebe escopo WHS: adaptar para Active/Inactive e isolamento da sessão.
- `actions/solo.ts:adicionarItemListaSolo` valida administrador, mas não consulta início/status da sessão antes de inserir. Implementar regra de lista fechada no servidor e verificar garantias do banco.
- `actions/solo.ts:lancarSoloContagemCounter` verifica sessão aberta; o caminho administrativo `lancarSoloContagem` não faz a mesma consulta. Não afirmar imutabilidade integral sem inspecionar proteções do banco e relatórios.
- `actions/inventario.ts:editarItemInventario` atualiza BPU diretamente e grava item/BINs em operações separadas. Mapear proteções existentes do banco antes de implementar aprovação dupla e atomicidade.
- `actions/contagem.ts` e `actions/solo.ts` guardam quantidades informadas e resultados convertidos. Isso ajuda no recálculo, mas peso, reconciliação e relatórios ainda precisam ser rastreados.

Prioridade: caracterizar proteções de encerramento e cálculos com testes; depois implementar warehouse/importação e isolamento em conjunto antes de liberar Service. Não publicar importação multiwarehouse enquanto contadores ainda puderem acessar inventário sem escopo.
