# Estado atual e prioridades

Atualizado: 2026-09-17

## Ponto de retomada — PR #70, 2026-09-17
Este bloco prevalece sobre os relatos históricos abaixo. Produção permanece na main; nenhum merge ou migration real autorizado/executado nesta etapa.

- Branch: `codex/inventory-warehouse-import`. Código/testes: `1e671e77653901fdf8cb51b2f2320052a5010b75`.
- Implementados: upload com revisão/revalidação e diálogo de duplicatas; confirmação da WHS; importação transacional; criação de sessões por WHS; consultas/gravações/RLS e combinação limitadas à WHS; busca agrupada Active/Inactive; ZIP com uma planilha por WHS.
- Upload antigo desativado na branch. Migration agora concede EXECUTE de importação a authenticated, mantendo autorização administrativa interna. Relatos antigos de RPC desconectado/revogado descrevem etapas anteriores.
- Confirmar importação no Preview é bloqueado no servidor: Preview compartilha banco de produção. Não testar criação/edição/contagem nesse banco.
- Validação: **245 testes aprovados**, commit `1e671e77653901fdf8cb51b2f2320052a5010b75`: [118 contratos](https://github.com/ycristan/ProjectCountStock/actions/runs/35227550115), [37 Excel/ZIP](https://github.com/ycristan/ProjectCountStock/actions/runs/35227550147), [90 banco](https://github.com/ycristan/ProjectCountStock/actions/runs/35227550006). Upgrade com histórico sintético preservado e lint sem erros. Vercel Preview READY no mesmo commit (`dpl_GrgSC1nQmvK6PV1fTzZRh3yJ9JGz`). Não substitui teste visual autenticado.
- Preview compilado: https://project-count-stock-ylmm-keckm9l3e-ycristans-projects.vercel.app/admin/upload . Consulta pelo conector retornou 302 para autenticação Vercel; não houve teste visual autenticado, nem afirmação de E2E completo.
- Correções de validação: referência antiga do componente e delimitadores SQL; corrigidos sem remover testes. O teste solo foi alinhado ao service_role usado pela Server Action, mantendo a expectativa de bloqueio por warehouse e acrescentando controle positivo e bloqueio do cliente direto.
- Avaliação segura no Preview: selecionar XLSX e Check spreadsheet; conferir erros/Status/WHS; duplicar Brand Code e escolher linha no diálogo; conferir resumo. Não usar dados fictícios em produção.
- Sessões por WHS e ZIP dependem do schema novo; ainda não disponíveis funcionalmente no banco real. Não aplicar migration isoladamente: coordenar banco e código, verificar compatibilidade do intervalo e pedir autorização de publicação.
- Fora deste bloco: completar Inventory unificado/manual/toggle/filtros, aprovação dupla de BPU/recálculo e itens desconhecidos. Não apresentar este pacote como conclusão dessas funcionalidades.
- Próximo passo após validação: avaliação autenticada do fluxo e preparação da publicação coordenada, sem inferir autorização de merge ou alteração de produção. Não pedir ao usuário para repetir regras já documentadas.


## Histórico das etapas anteriores


## Confirmado
- PR #66 (Sentry) e PR #67 (conectores primeiro) mergeadas.
- Vercel consultada pelo conector em 14/09: produção project-count-stock-ylmm READY, commit 86c603bd9bd9b5a4414eafb58ddd62bea22c1a25, correspondente à PR #66.
- Consulta de logs de produção da última hora não retornou erros/falhas fatais. Isso não prova ausência de erros em outros períodos.
- Yuri confirmou visualmente eventos de teste do navegador e servidor no Sentry em Preview. Página e endpoint temporários foram removidos antes do merge.
- Consulta direta ao Sentry pelo agente ainda não validada: na última tentativa faltava credencial de leitura. DSN de envio não concede leitura.
- Histórico da conversa registra conclusão das PRs #63 (autorização) e #64 (manutenção do banco). A descrição anterior de P0 em preparação está desatualizada; não tratar como auditoria atual. Aplicação das migrations foi relatada na sessão anterior, não reverificada hoje.

## Trabalho atual
Consolidar e revisar [Inventory e Warehouses](./INVENTORY_WAREHOUSES.md).
As regras descrevem a próxima implementação, não funcionalidades já publicadas.
A PR #65 foi encerrada sem merge. Especificação em revisão na PR #68.
Yuri aprovou uma planilha por warehouse, WHS obrigatório, atualização isolada e cadastro dinâmico com confirmação para warehouses novas. Essas regras ainda não foram implementadas.
As sete definições pendentes foram aprovadas e incorporadas na PR #68, incluindo BPU, lista fechada, ZIP e migração para Main. Conferência estática inicial registrada na especificação; ainda faltam rastreamento integral de banco/relatórios e execução dos testes. A PR #68 permanece documental; as proteções solo foram implementadas e publicadas separadamente pela PR #69, conforme atualização abaixo.

## Cuidados e backlog preservados
- Importações e outras operações com múltiplas gravações precisam ser transacionais.
- Proteger PINs contra tentativas repetidas e validar limites/estrutura de XLSX.
- Conferir estado atual de CI, lockfile e lint antes de propor trabalho duplicado.
- Evoluções de contagem/reconciliação por peso e finalização admin/independente continuam no backlog; não estão automaticamente autorizadas por esta documentação.
- Limpeza de código legado depende de análise e verificação de regressão.

## Publicação confirmada — 2026-09-15
- Yuri autorizou aplicação no banco e merge da PR #69. Merge concluído: 6638fec7b5d54647270961191fd76200ea71969c.
- Último head aprovado 61b1a6dd3d95e7bd8b6beeb498f5e0aae0d61f36 passou nos workflows de aplicação e banco (24 + 30 testes). Execuções: https://github.com/ycristan/ProjectCountStock/actions/runs/34856063111 e https://github.com/ycristan/ProjectCountStock/actions/runs/34856062990.
- Supabase: SQL de supabase/migrations/20260914142358_solo_inventory_write_guards.sql aplicado pelo conector como solo_inventory_write_guards, versão remota 20260915071703. As versões numéricas diferem porque o conector atribui a data de aplicação; não reaplicar cegamente a migration. Quatro triggers habilitados e nenhum marcador de início pendente no backfill.
- Vercel project-count-stock-ylmm: deployment dpl_7MPz8nbE6mxnThn6n62FpMhsMDEj READY em produção no commit do merge. https://project-count-stock-ylmm.vercel.app respondeu HTTP 200. Consulta de error/fatal deste deployment até 07:20 UTC não encontrou logs; não equivale a teste funcional autenticado completo.
- Proteções publicadas: registros solo encerrados, lista iniciada e BPU durante solo aberto. Nenhuma nova funcionalidade de warehouse ou aprovação dupla de equipes foi publicada.
- Advisor de segurança: proteção contra senhas vazadas desativada; não alterada nesta publicação. Aviso INFO de app_user_access sem políticas é coerente com acesso exclusivo via funções protegidas/service_role; não abrir acesso para eliminar o aviso.
- A PR #68 continua sem merge e precisa preservar estas atualizações ao ser reconciliada com main.

## Modelo de planilha — 2026-09-16
Yuri confirmou os 13 cabeçalhos definitivos, incluindo BPU, Status e WHS. Registrados na especificação da PR #68. Importador em produção ainda não foi alterado para o novo modelo.

## Implementação iniciada — PR #70, 2026-09-17
- Branch `codex/inventory-warehouse-import`, criada de main 6638fec7b5d54647270961191fd76200ea71969c; PR https://github.com/ycristan/ProjectCountStock/pull/70 em rascunho.
- Primeiro bloco: `lib/inventory-import.ts`, validador puro do formato aprovado e matriz de exportação. Não está conectado a nenhuma tela/Server Action e não acessa banco.
- Cabeçalhos obrigatórios em qualquer ordem; WHS única; Status explícito; BPU >= 1; opcionais vazios viram zero; todos os grupos duplicados exigem escolha explícita de linha. Não retorna payload parcial em caso de erro.
- Commit ad3b15fb6761bc0693baac179f5cbca42358f0c1: 105 testes de aplicação passaram (24 existentes + 81 do novo formato), zero falhas/skip/TODO. Evidência: https://github.com/ycristan/ProjectCountStock/actions/runs/35194500249. São testes sintéticos de código real; não provam isolamento SQL nem leitura de arquivos XLSX.
- Ainda pendentes: adaptador XLSX seguro (incluindo formato de códigos, fórmulas/erros e limites), warehouse no banco, transação de importação, interface de duplicatas/confirmação, isolamento completo dos contadores e download ZIP. Aprovação dupla e desconhecidos permanecem etapas próprias.
- Não houve migration, alteração do banco de produção ou merge. Importador publicado continua no formato antigo. Não publicar multiwarehouse até que a separação dos contadores também esteja implementada e testada.
- Regras da PR #68 copiadas para esta branch; PR #68 não foi mergeada. Histórico das proteções da PR #69 preservado.

## Continuação da PR #70 — base Excel/banco validada em 2026-09-17
Commit validado: `50893212d48aea32183741bdbafd8e64603d7d49`.
- Aplicação: 105 testes passaram; https://github.com/ycristan/ProjectCountStock/actions/runs/35196624244
- Excel real: 26 testes passaram; https://github.com/ycristan/ProjectCountStock/actions/runs/35196624259
- Banco descartável: 72 testes passaram (30 existentes + 42 de warehouses/importação), lint sem erros; https://github.com/ycristan/ProjectCountStock/actions/runs/35196624242
- A mesma execução recriou o schema anterior, inseriu histórico sintético, aplicou a nova migration e comparou nove tabelas: campos antigos preservados; produtos/sessões associados a Main; quatro guardas anteriores habilitadas.
- Vercel informou status success para esse commit (Preview), não um teste funcional autenticado de produção.

Implementado na branch:
- `lib/inventory-xlsx.ts`: leitura de XLSX com uma folha visível, preservação de códigos textuais e zero-padding; rejeita fórmulas, erros/datas, células mescladas e dados além dos limites. Inspeção do arquivo compactado antes do parser: 4 MiB enviados, 32 MiB expandidos, até 500 entradas e 50.000 linhas de produtos. Limites técnicos; não limitam a quantidade de warehouses.
- SheetJS fixado em 0.20.3 pela distribuição oficial; yauzl 3.4.0 para inspeção por streaming. `package-lock.json` gerado pelo npm no runner descartável, versionado e utilizado por `npm ci` no teste XLSX. Nenhum clone local.
- `20260917073526_warehouse_inventory_import.sql`, nome gerado pelo Supabase CLI 2.117.0: cadastro dinâmico, IDs/FKs/índices, associação inicial a Main via nova coluna com default constante (sem desligar triggers de fechados), importação transacional e validação no banco.
- Importação exige administrador protegido, confirmação para WHS nova, código globalmente único; aplica Status e zeros, substitui BINs e desativa ausentes apenas na WHS alvo. Falha posterior nos BINs reverte inclusive itens/warehouse recém-criados, conforme teste.
- Transferência bloqueada com sessão ativa na origem/destino. BPU continua bloqueado durante solo aberto e a importação normal não pode corrigir BPU com equipe aberta; aprovação dupla continua fora deste bloco.
- O novo RPC está SEM permissão de execução para anon/authenticated/service_role, deliberadamente. Testes concedem acesso apenas dentro de transação descartada.

Ainda NÃO implementado/liberado:
- Server Actions e interface do novo upload/confirmação, Warehouse na criação de sessões, isolamento completo de consultas/RLS/relatórios e ZIP por warehouse.
- O novo leitor e RPC não estão conectados ao importador publicado. Regras de leitura antigas continuam; NÃO aplicar/publicar esta migration sozinha nem liberar Service.
- Não há teste de carga/conexões concorrentes; as proteções usam lock transacional compartilhado, mas testes desta etapa são sequenciais.
- Nenhuma migration aplicada à produção, nenhum merge. PR #70 permanece rascunho.

## Revisão final desta etapa — 2026-09-17
- Código validado: `65439149f0cb0e68296f6398a0392740e0b31e34`.
- Total agora **206 testes aprovados**: 105 aplicação (https://github.com/ycristan/ProjectCountStock/actions/runs/35202826934), 29 XLSX real (https://github.com/ycristan/ProjectCountStock/actions/runs/35202826939) e 72 banco (https://github.com/ycristan/ProjectCountStock/actions/runs/35202826682).
- Migração com histórico sintético passou novamente; lint sem erros; status Vercel Preview success para o mesmo commit.
- Acrescentados limites de células antes do parser e três testes para dimensões de worksheet incorretas/excesso de células. Não truncar o arquivo para cumprir limite: arquivo inválido deve ser rejeitado, nunca parcialmente importado.
- Próxima etapa: Server Actions/interface de importação e isolamento de sessões/consultas por WHS, antes de conceder execução ao RPC. O leitor novo ainda não está ligado ao upload. Continuam pendentes UI unificada/manual/toggle e ZIP.
- Nada aplicado ao banco real, nenhum merge. PR #70 continua rascunho. Os commits posteriores a esse código validado nesta etapa são documentação.

## Template para download — 2026-09-17
- Implementado na PR #70: botão `Download Excel template` em /admin/inventario e /admin/upload, com instruções de preenchimento e aviso de novo formato ainda não aceito pelo upload atual.
- `lib/inventory-template.ts` reutiliza INVENTORY_HEADERS e SheetJS: uma folha Inventory, 13 cabeçalhos, linha vazia de entrada formatada (códigos como texto). Não contém produtos fictícios, fórmulas nem instruções dentro dos dados. Copiar a linha formatada ao acrescentar produtos.
- Componente cliente carrega o gerador sob demanda, mostra preparação/erro e não acessa o banco. Sem dependências novas. O download do inventário atual permanece separado.
- Commit validado: `d88aa963ca09eeb674d73bc5608bf49a9f986fc2`. **212 testes aprovados**: 105 contratos (https://github.com/ycristan/ProjectCountStock/actions/runs/35209068512), 35 XLSX incluindo 6 novos (https://github.com/ycristan/ProjectCountStock/actions/runs/35209068238), 72 banco (https://github.com/ycristan/ProjectCountStock/actions/runs/35209068426). Upgrade histórico passou, lint sem erros, Vercel Preview success.
- O teste XLSX grava/reabre o modelo, preenche e passa pelo leitor real: preserva código 006323, Status FALSE, BPU 1 e opcionais vazios. Modelo vazio não é aceito como importação. Verifica também cabeçalhos, formatação, ausência de dados/fórmulas e chamada de download.
- Um teste inicial assumia que sheet_to_json omitiria a linha com strings vazias formatadas; corrigido para verificar explicitamente as 13 células vazias. Nenhum teste removido ou ignorado.
- Revisão React: gerador carregado sob demanda, botão type=button, estado de preparação, erro acessível e nenhuma mudança nas fronteiras de autorização.
- Não executado teste visual autenticado nem abertura manual no Excel. Geração/releitura automática e compilação não provam interação real do navegador.
- Nenhum merge, mudança de produção ou aplicação de migration. PR #70 continua rascunho. Próximos passos já autorizados de implementação: novo upload/duplicatas/confirmação e isolamento WHS antes da liberação. Este template não conclui o módulo Inventory nem libera Service.
