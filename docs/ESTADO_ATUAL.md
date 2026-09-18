# Estado atual e prioridades

Atualizado: 2026-09-18

## Publicação executada — 2026-09-18
- Autorização explícita de Yuri confirmada na conversa; PR #70 mergeada em 8eac774b0eaf5192477a20940bf237a28a397589.
- Migration versionada 20260917073526_warehouse_inventory_import.sql aplicada integralmente pelo conector Supabase; histórico remoto 20260918120659 / warehouse_inventory_import. Não reaplicar por diferença de timestamp.
- Backup local autorizado excepcionalmente pelo usuário: pg_dump custom; leitura integral/schema/data pelo pg_restore com exit 0. Totais de 14 tabelas public coincidiram com produção antes da migration. Não houve ensaio de restauração em banco separado; não afirmar recuperação integral testada. Não enviar backup ao repositório: contém dados sensíveis e auth. Dump não inclui arquivos binários do Storage nem roles globais; restauração requer planejamento, especialmente schemas geridos/Vault.
- Após migration: hashes de todos os campos anteriores e totais de 14 tabelas idênticos ao pré-migration. 2279 itens, 4 sessões equipe, 45 solo associados a Main. 0 equipe aberta e 2 solo abertas preservadas. Triggers anteriores e novos habilitados.
- Três workflows do head d56299e passaram: 35233873980 (banco/HTTP), 35233874175 (contratos), 35233874004 (XLSX). Vercel Preview success. Teste HTTP usa banco descartável e coletor Sentry isolado, não comprova recebimento na conta hospedada.
- Produção Vercel READY: dpl_BRHWyWZFZEjZ7XNUhXNr4ydLKnE3, commit 8eac774b0eaf5192477a20940bf237a28a397589; alias project-count-stock-ylmm.vercel.app. Página pública HTTP 200. Consultas sem sessão a Inventory/ZIP devolvem HTML de login, não validam download autenticado. Nenhum log error/fatal encontrado neste deployment na consulta de 18/09 após 12:07 UTC.
- Publicação concluída; verificação funcional autenticada em produção e leitura/recepção na conta Sentry permanecem pendentes. Não afirmar que todos os fluxos de produção foram testados.
- Advisor mantém aviso preexistente de proteção de senhas vazadas desativada e INFO esperado de app_user_access sem policies (acesso protegido por funções/service_role). Nenhum novo aviso de segurança retornado.
- Não reverter cegamente código antigo após cadastrar outra WHS. Preferir correção compatível; recuperação de banco deve preservar gravações posteriores ao backup. Não executar restore --clean diretamente em produção.


## Histórico anterior — não representa pendência de publicação

# Estado atual e prioridades

Atualizado: 2026-09-17

## Fluxo integrado validado — 2026-09-17, commit 95a1ecb8cc8380edfb1a32674d48b6cddecf4503
- Execução: https://github.com/ycristan/ProjectCountStock/actions/runs/35233358896 .
- Aplicação compilada iniciada no runner do GitHub contra Supabase descartável. Autenticação real via Supabase SSR, cookies reais de usuário sintético, GET HTTP real da página Inventory e endpoint ZIP.
- Download comprovado: ZIP aberto, XLSX lidos, Main/Service separados, Status inativo e código 006323 preservados; acesso sem login redirecionado, sem arquivo.
- Incidente reproduzido renomeando coluna apenas no banco descartável. Endpoint devolveu 503 compreensível e eventId; SDK real enviou envelope ao coletor HTTP isolado, com correlação e sem email/senha/chave/cookie de autenticação. Log fallback confirmado.
- Isto NÃO prova recebimento na conta hospedada Sentry e NÃO é teste de cliques/hidratação num navegador. Não confundir essas camadas.
- As outras suítes passaram: 130 contratos (https://github.com/ycristan/ProjectCountStock/actions/runs/35233358890), 37 XLSX (https://github.com/ycristan/ProjectCountStock/actions/runs/35233358870), 90 SQL no job acima. Preservação de nove tabelas históricas e lint também passaram; Preview success.
- Workflow agora exige esse teste integrado para mudanças nos caminhos cobertos. Credenciais exclusivamente sintéticas no runner; script recusa execução fora do GitHub e URLs diferentes de 127.0.0.1:54321.
- Nenhuma mudança no app de produção nem migration aplicada. O ZIP no Preview continua indisponível por schema antigo, agora com tratamento explícito; o teste comprova que funciona com schema novo.
- Próxima fronteira de autorização: publicação coordenada do código PR #70 e migration. Antes dela, conferir schema/histórico remoto, bloquear temporariamente importações/criações durante a janela e confirmar snapshot/recuperação disponível. Não liberar Service com código antigo; não reverter cegamente para código antigo após cadastrar outras WHS.
- Leitura remota da conta Sentry continua pendente; não pedir token no Windows. Acompanhamento via conector Vercel permanece utilizável. Produção só poderá ser declarada validada após verificação pós-publicação, incluindo recebimento de evento no Sentry.



## Correção ZIP e observabilidade — 2026-09-17
- Causa do incidente confirmada na Vercel: em 13:57:20 UTC, /api/admin/inventario, deployment dpl_Dof71dK96ZhecacCH5uJ1qnBSYg2, erro "column inventory_items.warehouse_id does not exist". Preview consulta banco sem a migration. Não é evidência de perda de credencial Sentry.
- Commit de correção: ea9e7564a20abfee3ca859c756a97cf5cee11dce. Endpoint captura falha, retorna mensagem segura/503 e referência; botão faz fetch e mostra alerta dentro de Inventory, sem navegar para página genérica. Não gera ZIP sem schema, não aplica migration e não usa fallback silencioso para outro formato.
- Captura explícita com Sentry, espera limitada de flush (2s), evento sanitizado e fallback console.error com motivo/eventId/status de envio. Flush não prova recepção no painel. Sem dados de inventário, sessão ou mensagem bruta do banco no evento explícito.
- withSentryConfig adicionado mantendo limite do upload. Estava ausente também na main; não afirmar que era a única causa de ausência do evento. Source map upload desativado; não exige token de upload. Instrumentation e captureRequestError existentes preservados.
- 12 testes novos: schema ausente, erro retornado pela consulta, falha inesperada, sucesso ZIP, autorização, limite de tamanho, envio explícito/flush, Sentry sem configuração/indisponível e integração do build. Total 257: [130 contratos](https://github.com/ycristan/ProjectCountStock/actions/runs/35231336832), [37 XLSX](https://github.com/ycristan/ProjectCountStock/actions/runs/35231336988), [90 SQL](https://github.com/ycristan/ProjectCountStock/actions/runs/35231336946); upgrade preservado, lint sem erros.
- Preview READY: https://project-count-stock-ylmm-gvw2sfp0g-ycristans-projects.vercel.app/admin/inventario . Testes simulam transporte Sentry; não provam recebimento real. Avaliação visual autenticada ainda pendente.
- Plugin Sentry instalado/enabled, sem apps dependentes; catálogo não retornou conector Sentry. Skill instalada exige SENTRY_AUTH_TOKEN. Sem credencial de leitura nesta sessão. Correção de orientação: é proibido configurar tokens ou variáveis do projeto no Windows. Usar somente caminho remoto aprovado; nunca pedir chave no chat. Não alegar que token "sumiu".
- Bloqueio restante: confirmar o evento real no Sentry e o fluxo autenticado do Preview. Produção não alterada; não declarar monitoramento totalmente validado antes disso.



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
