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

BPU = 1 desativa Cases e Pallets. A relação entre BPU = 1 e contagem por peso está destacada nas pendências: não inventar uma decisão adicional.
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
O download completo deve trazer essas mesmas colunas e ser reutilizável no upload sem reativar involuntariamente itens inativos.
Nomes exatos dos demais cabeçalhos e formatos aceitos devem ser consolidados em um único modelo de importação/exportação.

## 4. Busca e inventário ao vivo

Durante uma contagem, buscar tanto produtos ativos quanto inativos da warehouse da sessão.
Mostrar um grupo Active primeiro, com verde suave; depois Inactive, com vermelho suave. Usar títulos/labels, sem depender apenas da cor.
Ambos podem ser selecionados e contados. Não acrescentar bloqueio ou confirmação obrigatória para inativos sem decisão de produto.

Exemplo: busca Coca-Cola mostra produtos ativos correspondentes acima e Coca-Cola Vanilla inativa abaixo.

O administrador pode criar, editar ou reativar produtos durante uma sessão. Um produto novo deve ficar disponível nas contagens ativas da sua warehouse.
Yuri exige aplicação viva: resultados chegam em tempo real aos administradores; alterações de inventário devem se refletir para os contadores, no mínimo após atualização da tela. A atualização automática é a direção desejada.
Preservar restrições de acesso e listas específicas já atribuídas a contagens solo; a interação de produtos novos com essas listas requer definição.

## 5. BPU durante contagens

Regra geral: não alterar BPU durante contagem.
- Em sessão de equipes, uma correção excepcional exige concordância de dois administradores da sessão, cada um validando sua própria senha.
- Em sessão solo ativa, alteração totalmente bloqueada.
- Importação de planilha também deve respeitar essa proteção: não pode contorná-la.

Não registrar senhas em logs, relatórios ou documentos. A implementação deve verificar duas identidades distintas e permissão no servidor.
Ainda é necessário definir o efeito de uma alteração em contagens já registradas e sessões encerradas. Não recalcular históricos silenciosamente.

## 6. Warehouses

Hoje há Main Warehouse e Service Warehouse, mas o sistema não deve limitar a quantidade a duas.
Uma planilha por warehouse, com coluna WHS obrigatória e o mesmo warehouse em todas as linhas. Arquivo com warehouses diferentes deve ser bloqueado antes de gravar. O sistema identifica o destino pela coluna e mostra ao administrador qual warehouse será atualizada.

Ao criar uma sessão, o administrador escolhe uma warehouse. Seus contadores só podem acessar produtos daquela warehouse, inclusive na busca por nome, código e BIN.
Brand Code continua globalmente único. Localizações podem ter nomes iguais em warehouses diferentes: buscar 40B numa sessão Main não deve mostrar um produto Service.

Aprovado por Yuri: manter cadastro dinâmico de warehouses alimentado pelo upload. Warehouse conhecida atualiza somente seu inventário; nome novo exige confirmação explícita do administrador antes da criação, evitando cadastros por erro de digitação. Cancelar não altera dados. Main e Service são os primeiros cadastros, não valores fixos no código. Terceira, quarta e demais warehouses não exigem mudança de código.
Usar identificação interna estável separada do nome exibido: renomear não perde produtos, vínculos ou histórico.
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

## 8. Pendências que realmente mudam o comportamento

Estas perguntas surgem da combinação das regras; não exigem reexplicar o sistema:
1. Download: definir como entregar o inventário completo em arquivos separados por warehouse, mantendo cada arquivo reutilizável no upload.
2. Transferência: se WHS mudar para um Brand Code existente durante sessão ativa, como tratar contagens já feitas e a disponibilidade nas duas warehouses?
3. Histórico: qual efeito de correção de BPU em quantidades anteriores? Em que momento sessões encerradas deixam de aceitar mudanças que afetem seus resultados?
4. Solo com lista restrita: produto novo entra automaticamente nessa lista ou depende de atribuição?
5. BPU = 1 com Weight Avg positivo: peso continua permitido? A decisão explícita desativou Cases e Pallets; o documento antigo PRODUTO diz somente unidades.
6. Padronização de espaços/maiúsculas em WHS: definir comparação para evitar cadastros equivalentes. A confirmação de warehouse nova já foi aprovada.
7. Itens existentes e sessões atuais precisam receber warehouse na migração: confirmar mapeamento antes de alterar dados.

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
- Contagens existentes e modalidades solo/equipes continuam preservadas.

As verificações acima são planejadas; não foram executadas nesta PR documental.
