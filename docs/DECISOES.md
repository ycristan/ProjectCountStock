# Decisões do projeto

## Como trabalhamos
- O repositório GitHub é a fonte de verdade; toda alteração vai por branch e PR.
- Yuri define comportamento de negócio; o agente propõe, explica e implementa a solução técnica.
- A comunicação com Yuri deve ser em português simples.
- Não fazer merge em `main` sem autorização explícita.

## Banco de dados
- Mudanças no Supabase devem existir como migration versionada em `supabase/migrations/`.
- A aplicação pode exigir aplicação manual da migration no Supabase; o PR deve dizer claramente se há esse passo.
- Dados de inventário com histórico são desativados, não excluídos.

## Segurança
- Papéis e permissões não devem usar `user_metadata` como fonte de autorização.
- Cada ação que altera dados precisa conferir permissão no servidor, mesmo que a rota já seja protegida visualmente.
- O cliente com `service_role` só pode ser usado depois da conferência de autorização.

## Produto
- O contador solo usa uma conta fixa administrada pela tela de configurações; credenciais nunca são documentadas.
- A abordagem antiga de login solo por cookie/PIN foi abandonada; não reintroduzir sem uma nova especificação.


## Autorização protegida
- A fonte de autorização será a tabela protegida `app_user_access`, lida no servidor e nas políticas RLS. Ela poderá conter mais de um tipo de acesso por usuário.
- `user_metadata` pode continuar a guardar apenas informação de apresentação, como nome; não concede permissões.
- A migration de autorização precisa ser aplicada no Supabase antes de publicar o código que passa a depender dela.

## Inventory e Warehouses — 2026-09-14
- Regras consolidadas em [INVENTORY_WAREHOUSES.md](./INVENTORY_WAREHOUSES.md); consultar antes de implementar.
- Distinguir decisões explícitas de Yuri, propostas técnicas e pendências. Não inferir regras ausentes a partir de validações antigas.
- PR #65 contém regras superadas; não fazer merge.
- Fluxo acordado: revisar especificação, depois implementar em etapas verificáveis.
- Trabalho de código pelo GitHub, sem clone local; conectores/API primeiro conforme AGENTS.md.

### Warehouses — complemento aprovado
- Uma planilha por warehouse; WHS obrigatório e único no arquivo. Importação afeta apenas essa warehouse, inclusive inativação de produtos ausentes.
- Cadastro dinâmico, sem limitar a Main/Service; novos nomes exigem confirmação administrativa. Identificação interna estável permite renomear sem perder vínculos/histórico.
- Brand Code permanece globalmente único. Sessão escolhe warehouse e restringe seus produtos.

### Decisões finais aprovadas — 2026-09-14
- BPU corrigido com duas aprovações recalcula registros da sessão aberta sem recontagem física; futuros usam novo BPU, fechados são imutáveis. Manter trilha de aprovação.
- BPU 1 permite contagem por peso se Weight Avg > 0, além de Units; Cases/Pallets desativados.
- Lista fechada iniciada não recebe novos produtos nem por administrador.
- Exportação completa em ZIP, uma planilha por WHS com ativos/inativos, Status e WHS.
- WHS ignora caixa e espaços nas pontas. Transferência bloqueada durante sessão ativa na origem ou destino (restrição aceita por enquanto).
- Todos os produtos e sessões atuais pertencem a Main; migração preserva histórico/resultados. Não existem itens Service.

## Publicação das proteções solo — 2026-09-15
- PR #69 e sua migration foram explicitamente autorizadas e publicadas. Não confundir esse escopo com implementação de warehouses ou aprovação dupla de equipes.
- Migration no repositório: 20260914142358_solo_inventory_write_guards.sql; registro remoto do conector: 20260915071703 / solo_inventory_write_guards. Comparar nomes e SQL antes de sincronizar histórico; não reaplicar por divergência de timestamp.
- Preservar testes e decisões da PR #69 ao atualizar esta branch documental em relação à main.

## Cabeçalhos aprovados — 2026-09-16
- Modelo único: Brand Code, Brand Name, Category, Category1, BPU, Pallet Size, Weight AVG, BIN Location 1, BIN Location 2, BIN Location 3, BIN Location 4, Status, WHS.
- BPU substitui Brand Purchase Unit. Weight AVG é em gramas.
- Todas as colunas presentes, qualquer ordem no upload; valores opcionais podem ficar vazios. Regras detalhadas em INVENTORY_WAREHOUSES.md.

## Testes e implementação incremental — 2026-09-17
- Preservar contratos da PR #69: funções reais com dependências simuladas, sem usar skip/inverter expectativas para aparentar aprovação; testes da aplicação não substituem banco.
- Proteções da PR #69 foram publicadas em 15/09, conforme registro acima; referências antigas a "proposta, sem produção" descrevem a etapa anterior à publicação.
- PR #70 começa pelo formato/validação sem ligar gravações. Não aceitar parcialmente uma planilha inválida, nem desativar tudo ao receber arquivo vazio.
- Resolução de duplicatas revalida a linha escolhida; seleção inexistente/repetida é rejeitada. WHS misturadas continuam proibidas mesmo se uma linha de outra WHS seria descartada.
- Comparação de WHS normaliza apenas caixa e espaços nas pontas; não assumir que "Main" e "Main Warehouse" são sinônimos. O adaptador deverá preservar os identificadores formatados de Excel antes da validação.
- Validador não cria warehouses, não autoriza usuários e não substitui a futura transação/constraints. Ativação do novo importador depende de warehouse e isolamento de sessões prontos em conjunto.

## Base técnica da importação — 2026-09-17
- Importação em uma única função transacional SECURITY INVOKER, com autorização administrativa protegida e revalidação do payload no banco. Não expor o RPC até concluir o isolamento de leitura/gravação das sessões e substituir o upload antigo.
- Cadastro de WHS e substituição de produtos/BINs fazem parte da mesma transação; qualquer erro reverte tudo. Desativação de ausentes usa warehouse_id, nunca o inventário inteiro.
- Associação inicial de registros a Main usa ADD COLUMN com default constante para não disparar UPDATE de sessões fechadas. Teste de upgrade compara todos os campos anteriores de nove tabelas.
- Identidade da warehouse de uma sessão fica fixa desde sua criação. Mudança do nome da warehouse preserva IDs e vínculos. Transferência de produto respeita contagens ativas na origem/destino.
- Edição/importação comum de BPU fica bloqueada enquanto houver equipe aberta; não introduzir bypass até existir operação dedicada com duas identidades aprovadoras e recálculo seguro. Preservada também a trava de solo da PR #69.
- Importação e mudanças de ciclo de sessão/inventário usam o lock transacional já existente, tomado antes dos locks de linha. Leituras e contagens comuns não ganham esse lock global diretamente; medir contenção antes de elevar a escala.
- A biblioteca Excel do npm estava na versão antiga 0.18.5. Esta branch usa a distribuição oficial SheetJS 0.20.3 e lockfile; validar importações/exportações legadas antes de publicar a mudança de dependência.
- Referências técnicas consultadas: https://supabase.com/docs/guides/database/functions ; https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ ; https://github.com/thejoshwolfe/yauzl . Changelog markdown do Supabase indisponível ao leitor web; referências de funções/CLI verificadas na documentação oficial.

## Template Excel para download — 2026-09-17
- Pedido explícito de Yuri: disponibilizar download do modelo do novo upload dentro do app.
- Reutilizar os 13 cabeçalhos do validador. Uma folha, sem produtos fictícios ou linhas instrutivas importáveis; instruções ficam na interface.
- Enquanto o upload antigo existir, mostrar aviso claro de incompatibilidade com o novo formato. Não publicar a PR antes dos critérios de isolamento/importação já estabelecidos.

## Execução por entregas — 2026-09-17
- Após aprovar uma entrega, Yuri não precisa autorizar cada passo técnico nem pedir continuidade. O agente executa implementação, correções e testes até concluir ou encontrar impedimento real.
- Comunicação breve: progresso relevante, riscos ou decisões necessárias. Build isolado não é entrega funcional.
- Interromper apenas por decisão de negócio não documentada, acesso indispensável, custo ou autorização de produção. Não confundir autonomia técnica com autorização para merge/migration em produção.
- Ao encerrar, registrar estado verificável, evidências, pendências e próximo passo no repositório. Entregar link e roteiro curto de avaliação; não transferir testes técnicos rotineiros ao usuário.

## Sem armazenamento local — regra reforçada
- Não criar clones, arquivos do projeto, tokens ou variáveis de ambiente do projeto no computador de Yuri. Não orientar configuração de SENTRY_AUTH_TOKEN no Windows.
- Testes descartáveis nos runners do GitHub continuam permitidos, sem segredos de produção. Credenciais sintéticas são geradas no runner e não são registradas no repositório.
- Falta de acesso de leitura ao Sentry não autoriza solicitar armazenamento local nem declarar a captura do aplicativo inoperante.


## Equipes — contrato aprovado em 2026-09-21
O plano revisado de nove entregas e sua implementação foram aprovados. Regras normativas em [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md); [cenários](./TEAM_COUNT_TEST_MATRIX.md) estão planejados, não executados.
Este contrato substitui para o novo fluxo a contagem tripla, a tolerância em gramas, o admin iniciando conciliação normal, o encerramento conjunto e a rejeição de todos os registros de quem saiu. Preservar a precedência e as exceções completas, sem copiar resumos contraditórios.
Resultados de equipe assinada são imutáveis inclusive frente a correções posteriores de BPU/cadastro; não aplicar recálculo de sessão aberta sobre equipe já congelada/encerrada. Nenhuma nova implementação do fluxo de aprovação dupla de BPU está incluída por inferência.
PR72 não está autorizada para publicação. Aprovação do plano permite branches/testes remotos, não merge/migration de produção. Entrega1 só documentação; seguir plano sem pedir reconfirmação das regras.

## Fundação de equipes — 2026-09-22
- PR #74 depende da #73; opt-in técnico por team_flows, sem converter sessões existentes. A migração é aditiva e a aplicação ainda não roteia para ela.
- Identidade Auth separada de membership; posição lógica separada da pessoa que contou, preservando autoria em substituições. Não criar contador_3/contador_4 como colunas.
- Revogação/visibilidade consultam vínculo e etapa atuais, não apenas JWT. Novas tabelas são somente leitura para authenticated e service_role até existirem comandos transacionais autorizados.
- Estados/guardas de banco são fundação, não prova de processo completo: conciliação, evidências de confirmação e autorização dos comandos ainda dependem das próximas partes.
- Testes de upgrade e testes de regras têm bancos descartáveis reinicializados entre si para não compartilhar sessões sintéticas abertas. Nunca remover travas para acomodar fixtures.

- Preservar componentes físicos e parâmetros da contagem, não apenas total convertido: total canônico gerado pela mesma aritmética de convert_count. Histórico mantém componentes e total; correção administrativa de BPU continua sem comando autorizado neste bloco.
- Em 22/09 a base passou nos 136 testes SQL, duas disputas concorrentes, upgrade e regressão HTTP (execução 35722151547). Isso não conclui a entrega 2 nem libera produção.

## Comandos individuais — 2026-09-22
- Autoria derivada de auth.uid() e vínculo protegido, nunca parâmetro livre ou metadata. Função interna elevada no schema private, wrappers públicos invoker; sem concessão de escrita nas tabelas.
- Pedido/decisão/avanço da etapa e evento persistem na mesma transação. UUID de comando mais payload original permite retry sem reaplicar; revisão esperada impede decisão sobre tela antiga.
- Eventos de finalização sem quantidades, PINs ou motivo livre. Contador lê apenas eventos próprios; independente da equipe/admin leem conforme vínculo protegido. Eventos não podem ser reescritos/excluídos.
- Comandos deste bloco cobrem somente finalização normal; não simulam admin excepcional antes de implementar posse/substituição. Último aceite abre etapa de reconciliação, não aceita produtos nem submete equipe automaticamente.

- Evidência dos comandos: commit f8326fcdc89a96539e8d4051c79d81221762b786, run35731209411: 170 SQL e Auth/PostgREST reais aprovados, incluindo concorrência/retry/revogação. Sem publicação ou interface nova ativada.
