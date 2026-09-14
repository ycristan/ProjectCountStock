# Estado atual e prioridades

Atualizado: 2026-09-14

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
As sete definições pendentes foram aprovadas e incorporadas na PR #68, incluindo BPU, lista fechada, ZIP e migração para Main. Conferência estática inicial registrada na especificação; ainda faltam rastreamento integral de banco/relatórios e execução dos testes. Nenhum código ou banco foi alterado.

## Cuidados e backlog preservados
- Importações e outras operações com múltiplas gravações precisam ser transacionais.
- Proteger PINs contra tentativas repetidas e validar limites/estrutura de XLSX.
- Conferir estado atual de CI, lockfile e lint antes de propor trabalho duplicado.
- Evoluções de contagem/reconciliação por peso e finalização admin/independente continuam no backlog; não estão automaticamente autorizadas por esta documentação.
- Limpeza de código legado depende de análise e verificação de regressão.
