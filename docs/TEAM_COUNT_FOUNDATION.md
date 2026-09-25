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
Este bloco NÃO conclui a entrega 2 inteira. Ainda faltam os demais comandos, auditoria das etapas posteriores, integração das versões preservadas com decisões/relatórios e integração com a identidade/rotas da aplicação.
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

## Versões preservadas — 2026-09-22
Código: aad292839465853614831d64aeb084de8cd0f363.
Execução aprovada: https://github.com/ycristan/ProjectCountStock/actions/runs/35735213309 .
- 211 testes SQL (170 anteriores + 41 novos), sem retirar testes.
- team_result_versions e team_result_items preservam revisão, warehouse/equipe/participantes, cadastro/BPU/locais/status, resultado e fontes originais por autor/posição/método/componentes.
- Builder privado INVOKER sem EXECUTE para anon/authenticated/service_role. Recebe resultados JÁ validados dos futuros comandos; não é endpoint para enviar quantidades arbitrárias. Não implementa comparação/tolerância/conciliação por si só.
- Constrói itens e sela versão atomicamente. Cobertura exata das marcas contadas pela equipe; falha deixa zero versão parcial. Não cria zeros globais de inventário.
- Entrar em signing exige versão selada da revisão atual. Cancelar antes da confirmação limpa seleção sem apagar histórico; nova revisão cria outra versão. Versão selecionada não troca após congelamento.
- Fontes e cadastro são copiados no banco, não aceitos como metadata do cliente. RLS de snapshots é apenas monitor/admin; nenhum bypass da contagem cega.
- Testes comprovaram preservação diante de alteração de nome/status/categoria/local do produto e nomes de warehouse/equipe; BPU guardado e quantidade da versão não podem ser editados. NÃO foi executada uma correção de BPU no cadastro após fechamento geral, cujo comando ainda falta.
- Versões/itens não têm exclusão ou edição; uma versão selada não recebe mais produtos. Versões antigas permanecem após recontagem sintética.
- Fixtures de congelamento anteriores agora selecionam versão de fato, sem remover proteções. Elas continuam fixtures de banco, não assinatura/reconciliação pelo usuário.
- Auth/PostgREST reais confirmam leitura autorizada/cegueira, proibição anônima e de escrita direta. Upgrade, concorrência, lint, build, ZIP e demais regressões passaram.
Ainda faltam integração com identidade/rotas, decisões/rodadas de reconciliação e seus detalhes, aprovação/assinaturas e consumo das versões nos relatórios. Nenhuma dessas funcionalidades é marcada como publicada.

## Contexto protegido do participante — 2026-09-22
- Consulta `my_team_flow_contexts` deriva usuário de auth.uid(), sem parâmetro de identidade nem user_metadata. Retorna somente vínculos próprios ativos em equipes/sessões abertas, papel, warehouse, etapa e revisão textual.
- Independente compartilhado recebe todos os seus contextos; filtro opcional por equipe verifica o mesmo escopo. Não escolher a primeira equipe automaticamente. Admin monitor não é participante por inferência.
- Helper SSR usa cookies e chave pública, sem service_role/cache/fallback legado. Rota de leitura `GET /api/team-flow/context` retorna no-store; equipe sem vínculo é 404, parâmetros inválidos 400 e falha de consulta 503 correlacionada.
- Falha de consulta não vira lista vazia de equipes. Telemetria contém operação e erro genérico, sem identidade, cookies, PINs ou erro bruto do banco.
- Esta consulta NÃO autoriza comandos de escrita: cada transação continua revalidando vínculo, papel, etapa e revisão. Nenhuma tela/login legado foi redirecionado; novo PIN, seleção visual e ativação ainda são etapas posteriores.

### Testes adicionados
13 asserções SQL para identidade, falsificação de metadata, escopo, administrador, anon/service_role e encerramento seletivo.
O teste HTTP inicia a aplicação compilada e usa Auth/cookies SSR reais: papel protegido, duas warehouses, contexto explícito, revogação com os mesmos cookies e falha de RPC com evento sanitizado recebido pelo coletor isolado.
Encerramento e saída neste teste são fixtures privilegiadas; não são comprovação dos futuros comandos/interface de assinatura ou saída. Não testa login PIN, navegador/Realtime nem recebimento na conta Sentry hospedada.

Validação: commit 5203567c70b2ebd4842c5c607915585f6bdfbacb; execução aprovada https://github.com/ycristan/ProjectCountStock/actions/runs/35745578043. 224 asserções SQL (211 anteriores + 13 novas); upgrade, lint, duas disputas concorrentes, build, Auth/SSR/contexto, ZIP e comandos Auth/PostgREST passaram. Recebimento de telemetria comprovado somente no coletor isolado, não na conta Sentry hospedada.

## Compatibilidade PIN + monitor comprovados no navegador — 2026-09-24
Código 44ec912cab3d6a0d8b4a6705773f9961f077c021; execução aprovada https://github.com/ycristan/ProjectCountStock/actions/runs/35978421959.
- Reaproveitados com rastreabilidade da PR72: lib/pin-credentials.ts, compatibilidade de login, criação legada com compensação e migration 20260921084500_reconcile_legacy_team_pin.sql. Não importado o bloqueio total de busca do independente.
- PIN de equipe e pessoal continuam quatro dígitos. Senha interna derivada atende política do Auth; isso NÃO aumenta entropia nem substitui rate limiting. Fallback antigo somente em invalid_credentials, sem redefinir contas existentes.
- Login direciona explicitamente pelo papel protegido para admin/solo/busca/monitor. O teste de navegador detectou permanência em "/" no redirecionamento intermediário; corrigido antes de aprovar.
- Layout/busca não usam counter_role/team_id de user_metadata. Independente pode consultar produto/BIN/BPU/Pallet/peso; não abre formulário inicial, não usa finalização de contador. Server Action e políticas restritivas impedem gravação inicial direta.
- Replay inclui coluna team_pin já existente historicamente em produção. Fixture de upgrade emula essa coluna ANTES de tirar snapshot, mantendo comparação integral; reset fresco prova criação quando ausente. Nenhum valor histórico é reescrito.
- 224 SQL + 130 contratos de aplicação + 37 XLSX = 391 verificações aprovadas, além de concorrência e integrações HTTP/navegador. Lint e preservação de histórico/Auth passaram.
- Chromium real: admin entrou pelo formulário, criou equipe legada pela tela e recebeu três credenciais; contador1/2 entraram e salvaram pela UI; independente entrou no monitor e recebeu valores via Realtime sem refresh. Consulta sem controles de escrita, Server Action/Data API indevidas negadas, metadata forjada sem promoção, PIN errado rejeitado e PIN histórico curto aceito.
- Fixtures privilegiadas criaram apenas admin/sessão/inventário e a conta histórica sintética; criação da equipe e lançamentos do percurso principal passaram pelos botões reais. Sem screenshots/cards/traces com PINs publicados. Diagnóstico do navegador sanitiza credenciais.
- Inventário/solo preservados nos contratos existentes; propriedade readOnly é opcional e false por padrão. Revisão React: autorização no servidor, segredo fora de props/client, hooks mantidos incondicionais e componente de busca reutilizado.

### Limites atuais e teste manual
Este é o trecho de COMPATIBILIDADE do fluxo atual de três participantes, NÃO cadastro variável concluído nem implementação completa do novo fluxo. Não prova novas aprovações/conciliação/assinaturas/encerramento pelo navegador. Criação legada ainda não é a transação idempotente do futuro cadastro variável; compensação não equivale a atomicidade Auth+Postgres.
Preview verificado pelo conector Vercel: READY, deployment dpl_8cxRG58vXKAH83WqAfHaPJfa6Xt8, mesmo commit: https://project-count-stock-ylmm-d9mrg2vlg-ycristans-projects.vercel.app.
Somente avaliação manual de login/monitor/consulta com contas existentes. Preview compartilha produção: NÃO criar equipes, contar, finalizar ou alterar cadastro para teste ali. Criação/escritas foram verificadas exclusivamente no runner descartável.
Sem merge, migration real, clone ou arquivos/segredos do projeto no Windows. Sentry hospedado não foi validado; coleta isolada permanece aprovada.
Próximo bloco: criação transacional/recuperável de equipes variáveis integrada a memberships/slots e telas, sem prolongar dois fluxos completos; preservar compatibilidade e ativar somente com autorização conjunta.


## Bloco 3A — builder interno de cadastro
Código ab9b93bc1f15c654957996159c20a39168de87e5; execução aprovada https://github.com/ycristan/ProjectCountStock/actions/runs/36115545145 . 59 novos testes SQL, total 463 verificações (288 SQL + 138 contratos + 37 XLSX), além de upgrade, lint, concorrência e HTTP/Chromium/Realtime. Retry simultâneo retornou uma única equipe de cinco pessoas e quatro posições. Falha inicial de geração dos delimitadores/âncoras SQL corrigida antes desta execução; nenhum teste/proteção removido.
private.build_team_setup é INVOKER sem EXECUTE para os papéis da aplicação; não é RPC exposto. Transação cria team/setup/memberships/slots/assignments/recibo privado; falha reverte o conjunto. Exige ator admin protegido, sessão aberta, pessoas distintas sem acesso/vínculo anterior, email consistente com PIN da equipe e exatamente um independente. Recibo imutável guarda hash/IDs/autor, sem PINs ou nomes em claro. Preserva posição zero para independente e ordem crescente dos contadores. Repetição idêntica retorna o mesmo ID; payload/ator diferente rejeitado. Não há ativação de contagem ou emissão de acesso.
Testes internos privilegiados comprovaram armazenamento e locks, NÃO criação por Auth/UI. Próximo 3B deve implementar orquestração Auth recuperável e wrapper estritamente autorizado antes de ligar formulário/cartões. Não expor o builder diretamente nem aceitar identidades livres do cliente. Esta transação não é atomicidade Auth+Postgres; nenhum PIN real foi criado/alterado. Nenhum teste manual necessário neste bloco. Sem merge/migration real.

## Bloco 3B — cadastro variável e recuperação validados na branch
Formulário opt-in cria equipes de 3/4/5 pessoas (sem máximo artificial de cinco), com N-1 contadores, um Independente e PINs de equipe/pessoais de quatro dígitos. Cartões existentes reutilizados. Plano operacional privado recupera Auth parcialmente provisionado; todos os vínculos do lote são publicados na mesma transação. Reserva protege PIN e sessão contra criação legada concorrente. Qualquer admin protegido pode retomar; metadados editáveis não autorizam papéis nem apropriação de identidades.
Código c28e2fa33c43cf3da1c187c704c84c678bd2fd59; execução https://github.com/ycristan/ProjectCountStock/actions/runs/36123374995. 31 novas asserções SQL, total 494 verificações (319 SQL + 138 contratos + 37 XLSX), além de upgrade, lint, concorrência, build e integrações Auth/HTTP/Chromium/Realtime.
Navegador real comprovou: falha no último usuário Auth sem equipe/cartão parcial; falha tardia no banco após 12 identidades com rollback de todas as equipes; reload recupera nomes; resposta perdida após commit recupera cartões; repetição e duas janelas simultâneas preservam uma equipe e os mesmos PINs; entrada real de contador/Independente em cada tamanho resolve equipe/WHS/papel sem cair na contagem legada. Regressões de contagem/monitor legado, Solo, busca Active/Inactive, recuperação WHS e exportações passaram.
Limite: novo acesso termina em contexto de setup, sem contagem ativada. T01 tem cadastro/cartões comprovados, mas colunas/monitor variável ainda dependem do bloco 4; T55 não concluído. Flag `TEAM_SETUP_ENABLED` foi habilitada somente no runner, nunca Vercel/produção. Sem merge, migration real, clone ou segredo local. Falhas de fixture JSON e alias SQL encontradas nas execuções iniciais foram corrigidas sem retirar testes/proteções.
Ponytail full aplicado; Review removeu cache redundante de IDs/array auxiliar e declaração duplicada de segurança (3 linhas no ajuste final), reaproveitando PIN/cartões/telemetria e transações nativas, sem dependências novas. Revisão final de complexidade: Lean already. Ship. Não é autorização de publicação.
**Nenhum teste manual necessário neste bloco.** Não gravar testes na Preview compartilhada. Próximo bloco: 4, contagem/monitor no modelo novo.

