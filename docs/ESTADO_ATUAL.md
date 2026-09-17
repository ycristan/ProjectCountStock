# Estado atual e prioridades

Atualizado: 2026-09-17

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
