# Recuperação do inventário separado por nome — 2026-09-24

## Causa confirmada
A migration 20260917073526 criou Main e associou o inventário existente.
O upload BDS Main Warehouse criou outra identidade; o upsert transferiu apenas os códigos presentes.
Produtos omitidos ficaram no cadastro antigo. Busca não deve atravessar warehouses para esconder esse defeito.

## Estado real consultado
- Main: 1.784 produtos (77 ativos / 1.707 inativos).
- BDS Main Warehouse: 511 (446 ativos / 65 inativos).
- Kinder: 9888 ativo no destino; 9816, 9767, 6152, 2746, 1231, 1213 inativos na origem.
- Yuri confirmou que subiu apenas BDS Main Warehouse; Main foi criado pela migração.
- Em 24/09, Yuri autorizou encerrar as quatro sessões de TESTE abertas. Foram alterados apenas status de duas sessões de equipes e duas solo. Nenhuma contagem foi apagada ou recalculada.
- Não há autorização implícita de merge ou execução da recuperação do inventário.

## Prevenção desta PR
A transação rejeita criação de WHS nova quando a planilha contém Brand Code já cadastrado.
Nenhuma warehouse/produto/BIN é gravado nesse caso. Nomes existentes normalizados continuam aceitos.
Nova WHS com produtos novos continua permitida. Transferência entre WHS já cadastradas mantém a regra anterior.
Uma transferência intencional para WHS ainda inexistente agora exige preparação explícita; não é mais inferida apenas da confirmação de criação.
Para renomear o mesmo armazém, deve-se preservar o ID, não fazer uma importação que transfere parte dos produtos.
Esta PR não inclui uma nova interface genérica de renomear/unificar warehouses.

## Recuperação operacional proposta (não automática)
Script: supabase/maintenance/recover-split-inventory.sql.
1. Exige IDs explícitos da origem/destino e fingerprints atualizados de ambos inventários.
2. Recusa sessões abertas; lock compartilhado com importações/criação de sessão e locks de tabelas.
3. Move todos os produtos legados da origem para o destino, SEM recriar Brand Codes.
4. Produtos da origem ausentes do upload ficam inativos, conforme regra de substituição: os 77 antigos ainda ativos passam a inativos. Não reativar os 1.707 já inativos.
5. Resultado esperado se os dados não mudarem: BDS Main Warehouse com 2.295 produtos (446 ativos / 1.849 inativos).
6. Confere exatamente todos os campos de inventário, permitindo só warehouse_id e Status da origem; compara integralmente 11 tabelas de histórico/BIN/identidade.
7. Não altera warehouse_id de sessões antigas, quantidades, BPU, BIN, equipes, credenciais ou resultados fechados. Main permanece como identidade histórica; não apagar registro com vínculos.
8. Por padrão faz ROLLBACK. apply=true só após aprovação explícita e dry run atualizado. Qualquer divergência aborta toda a transação.
9. Após execução: conferir os sete Kinder (1 ativo/6 inativos) numa NOVA sessão BDS, download e relatórios antigos. As sessões de teste encerradas não serão reabertas.
10. O cadastro Main vazio ainda aparece no seletor atual: desativar/ocultar cadastros históricos é uma melhoria separada, não alegar unificação completa da interface.

## Validação
Primeiro commit 1f129cdad4bafbdea2d8079d148d578d26617985 reproduziu a falha no banco descartável:
https://github.com/ycristan/ProjectCountStock/actions/runs/35989792888
Teste criou indevidamente a nova WHS e transferiu o código; 4 expectativas falharam.
Migration corretiva criada com Supabase CLI no runner: 20260924105320_prevent_accidental_warehouse_split.sql.
Validação final concluída; ver evidências abaixo.

## Limites
Script não é backup externo; obter/verificar recuperação disponível antes da aplicação real.
Não executar em Preview, pois ele compartilha o banco real.
Nenhum clone, segredo ou arquivo de projeto foi criado no Windows.
Referência técnica: https://supabase.com/docs/guides/database/functions .

## Validação concluída — 2026-09-24
Código validado: 1a2aba6f902acb8e37ceb12d07b7f6ab3babed0d.
- 134 contratos aprovados: https://github.com/ycristan/ProjectCountStock/actions/runs/35991431172 .
- 95 testes SQL, upgrade, lint, recuperação, build, Chromium e HTTP/XLSX aprovados: https://github.com/ycristan/ProjectCountStock/actions/runs/35991431157 .
- Recuperação executada apenas no banco descartável, com mais de 1.200 produtos para atravessar o limite de página de 1.000. Busca real digitada: Kinder = 1 Active e 6 Inactive; código 1213 e BIN 40B; seleção de inativo abre formulário; outra WHS não aparece.
- Relatórios fechados de equipes precisaram de correção complementar: metadados buscados por códigos históricos em lotes de 200, não pela warehouse atual. Quantidades continuam salvas, sem recálculo. Verificação de página e XLSX de equipe/solo passou.
- A tentativa anterior falhou ao procurar célula na aba oculta; teste passou a abrir Merged, sem remover sua expectativa.
- Nenhuma recuperação real/migration/merge nesta etapa. Somente as quatro sessões de teste foram encerradas com autorização explícita.
- O commit posterior de registro altera documentação e cobertura de gatilhos do workflow, não o código funcional validado acima.

## Sequência necessária antes de produção
1. Aprovação explícita do merge e aplicação dos dados; confirmar backup recuperável.
2. Atualizar leituras/checksums sob nova revisão; a origem é Main (ff60b6ce-edb1-4050-b1a5-b3d40f88d765), destino BDS Main Warehouse (fe6ca6fc-cd9b-4a2e-abb9-046196ab4cfd). Nunca buscar IDs apenas por nomes mutáveis ao executar.
3. Aplicar migration preventiva versionada; publicar PR #75 e confirmar código com consultas históricas corrigidas em produção ANTES de mover produtos.
4. Executar script em dry run e revisar resumo, depois aplicar com os mesmos IDs/checksums mediante autorização. Não desligar triggers e não reabrir sessões encerradas.
5. Verificar 2.295 produtos (446 ativos / 1.849 inativos, se dados não mudaram), sete Kinder no destino e relatórios históricos. Main permanece vazio para preservar vínculos; o seletor atual ainda o lista.
6. Recuperação não altera credenciais nem resolve o novo fluxo de equipes da PR #74.

## Pendência de segurança separada
npm ci emitiu 3 alertas de dependências (2 high e 1 critical), já presentes no lockfile utilizado. O build não identifica os pacotes no resumo; auditar detalhadamente em tarefa específica. Não houve npm audit fix --force nem atualização de dependências nesta correção.
