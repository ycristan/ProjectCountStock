# Entrega 2 — fundação técnica em implementação

PR dependente da #73. Não publicar ou aplicar isoladamente.

## Implementado neste bloco
- team_flows identifica exclusivamente equipes do novo fluxo; ausência significa legado, nunca conversão implícita.
- team_memberships separa identidade Auth e participação/papel/ordem/estado individual. Uma identidade pode participar de mais de uma equipe.
- team_count_slots representa a posição lógica e team_slot_assignments preserva autoria temporal na substituição.
- team_count_records preserva Pallets/Cases/Units, BPU/Pallet Size usados e método; unidades canônicas são geradas pela mesma fórmula de convert_count. Histórico preserva componentes e resultados, permitindo futura correção aprovada de BPU sem perder o que foi contado.
- Leitura RLS: contador vê só seus registros, independente monitora seus vínculos ativos, admin protegido lê histórico. Encerrar A não remove acesso B.
- Nenhum cliente, admin da aplicação ou service_role recebe escrita direta nas tabelas novas. Somente os dois comandos de finalização normal descritos abaixo têm execução autenticada; não conceder ALL para contornar erros.
- Guardas de autoria, revisões, WHS, bloqueio individual, transições básicas, congelamento e exclusão. Escritas legadas rejeitam equipes versionadas.
- Migration aditiva, sem backfill, sem alteração de PIN/contagens/autenticação legados.
- CLI gerou o nome da migration no runner: execução 35720003065, sem conexão ao banco real.

## Limites explícitos
Este bloco NÃO conclui a entrega 2 inteira. Ainda faltam os demais comandos, auditoria das etapas posteriores, snapshot completo de resultados e integração com a identidade/rotas da aplicação.
Não há botão novo, novo login, criação de equipe pela UI nem captura de assinatura habilitados.
Quantidade canônica é derivada dos componentes, não fornecida livremente pelo cliente. Não há API de escrita de quantidades. Validação de métodos e conversão de peso continuam pendentes na integração.
Guardas de fase não comprovam pendências de conciliação ou evidências de assinatura. Essas verificações devem existir antes de liberar comandos de conciliação, submissão ou assinatura.
Substituição pelo independente permanece indisponível até a operação dedicada da entrega 6; a fundação não autoriza esse atalho.
A proteção de contagem cega nova não corrige por si só as rotas legadas. Correções da PR72 serão incorporadas com rastreabilidade.
Não implementar duas aplicações em paralelo: os registros antigos permanecem para histórico/compatibilidade, equipes novas só serão roteadas ao novo fluxo após integração completa e ativação aprovada.

## Comandos individuais normais
- request_team_finish: somente o próprio contador ativo pede finalização; bloqueio e recibo persistem juntos.
- decide_team_finish: somente independente ativo da equipe aceita/rejeita pedido pendente; admin normal não decide. Rejeição não recebe motivo livre.
- Último aceite muda etapa para reconciling, mas não resolve comparações nem submete a equipe. As operações dessas etapas ainda não estão expostas.
- private.team_finish_command eleva privilégio exclusivamente após validar auth.uid(), vínculo protegido, equipe, etapa e revisão. Wrappers públicos são invoker; anon/service_role sem EXECUTE; tabelas sem escrita direta.
- team_finish_events mantém autor/participante/equipe/decisão/versão. Sem quantidades, credenciais, assinaturas ou textos pessoais. RLS permite ao contador somente seus eventos; independente/admin conforme escopo protegido.
- Retry usa UUID de comando e payload original, retorna recibo sem repetir decisão. O acesso atual é revalidado antes do retry; revogação não depende de renovar token.
- Lock por equipe serializa decisões, e revisão esperada rejeita tela antiga. Registro do evento é parte da transação.
- Saídas/substituições permanecem bloqueadas nestes comandos normais até implementar autoridade excepcional; não improvisar autorização do admin.
- Chamadas reais de Auth/PostgREST são testadas no runner. Nenhuma tela da aplicação está ligada aos comandos.

## Verificação anterior executada
Código: 4c06317ca3a29d4476ac04d825eb3c488530f940.
Execução aprovada: https://github.com/ycristan/ProjectCountStock/actions/runs/35722151547
- 136 testes SQL (90 anteriores + 46 novos).
- Upgrade com comparação de todas as tabelas públicas preexistentes e auth.users, incluindo PIN individual sintético gerado no runner.
- Duas disputas concorrentes usando conexões PostgreSQL separadas: edição/edição e edição/congelamento.
- Lint SQL sem erros.
- Build e regressão HTTP de Auth/ZIP/erro com coletor SDK isolado. Não prova recebimento no Sentry hospedado.
Cobertura parcial T01/T03/T04/T05/T06/T07/T08/T31/T33/T37/T38/T44/T45/T49/T50/T53.
Não equivale à execução completa dos 55 cenários nem a navegador/Realtime/PIN do novo fluxo.
O exemplo BPU 20/24 verifica capacidade de armazenamento/recálculo, NÃO a operação de aprovação dupla ainda pendente.
Falhas anteriores de sintaxe e preparação/isolamento dos testes foram corrigidas sem relaxar permissões nem remover verificações.

## Referências técnicas
RLS/grants e diferença entre autorização e autenticação conferidos na documentação oficial:
https://supabase.com/docs/guides/database/postgres/row-level-security
O índice changelog.md não foi renderizado pelo leitor web (tipo text/markdown); não alegar revisão desse conteúdo.

## Validação dos comandos — 2026-09-22
Código: f8326fcdc89a96539e8d4051c79d81221762b786.
Execução: https://github.com/ycristan/ProjectCountStock/actions/runs/35731209411 .
- 170 asserções SQL aprovadas (136 anteriores + 34 dos comandos).
- HTTP com autenticação real e PostgREST: anônimo, service_role, metadata forjada, outro participante/equipe e admin normal rejeitados.
- Dois pedidos simultâneos na mesma revisão: um sucesso e um conflito; retry sem novo evento.
- Rejeição individual, novo pedido, aceites e avanço à reconciliação; autor protegido registrado; contador lê somente eventos próprios.
- Token já emitido perde acesso a comando/recibo após revogação do vínculo.
- Upgrade preservado; lint SQL sem erros; dois testes concorrentes anteriores e regressões de build/Auth/HTTP/ZIP/coletor Sentry isolado aprovados.
Não comprova interface/Realtime/PIN do novo fluxo, comparação/reconciliação, assinaturas nem conta Sentry hospedada. Não executado advisor remoto sobre esta migration, pois não foi aplicada em produção.
