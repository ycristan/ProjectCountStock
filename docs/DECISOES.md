# Decisões do projeto

Registro de decisões e do motivo. **Só acréscimos**, no fim do arquivo: data, decisão, motivo (2 a 5 linhas). Evidências de teste ficam nas PRs.
Consolidado em 2026-10-05 a partir de `docs/`, `.claude/memory/` e das branches das PRs #68, #71, #72, #73 e #74.

## Processo
- GitHub é a fonte de verdade; toda mudança por branch + PR; merge com squash e só com autorização explícita de Yuri naquela vez (já houve dois merges não autorizados, incluindo o rebrand da PR #53, revertido).
- Yuri define o negócio; o agente decide e executa a parte técnica e explica em português simples.
- Após aprovar uma entrega, o agente segue sem pedir "continue". Para só por decisão de negócio nova, acesso, custo ou autorização de produção.
- Toda entrega declara se há teste manual e, se houver, exatamente o que testar. Testes técnicos rotineiros não são transferidos para Yuri.
- Nada de clone, arquivos, tokens ou variáveis do projeto no computador de Yuri. Exceção única (2026-09-18): backup local com pg_dump, autorizado por Yuri; nunca enviar backup ao repositório ou a Actions.

## Banco de dados e segurança
- Toda mudança de schema, RLS ou função vira migration versionada; a PR diz se há aplicação manual.
- Autorização pela tabela protegida `app_user_access` (pode ter mais de um papel por usuário). `user_metadata` só guarda apresentação, como nome.
- `service_role` só depois da conferência de autorização no servidor.
- Inventário com histórico é desativado, nunca excluído.
- Advisor: proteção contra senhas vazadas segue desativada (não alterada); aviso INFO de `app_user_access` sem policies é esperado (acesso só por funções protegidas). Não abrir acesso para sumir com o aviso.
- Backup de 2026-09-18 foi lido integralmente por pg_restore, mas nunca restaurado em banco separado: não afirmar recuperação testada. Não fazer `restore --clean` em produção nem reverter código às cegas depois de cadastrar outras warehouses.

## Solo
- Contador solo usa conta fixa administrada em Configurações, com login 2-PIN. Login por cookie/PIN foi abandonado; não reintroduzir sem nova especificação.
- Proteções publicadas na PR #69 (2026-09-15): registros solo encerrados imutáveis, lista iniciada fechada, BPU bloqueado durante solo aberto.

## Inventory e Warehouses (2026-09-14 a 2026-09-17)
- Contrato completo em [INVENTORY_WAREHOUSES.md](./INVENTORY_WAREHOUSES.md). PR #65 tinha regras superadas e foi fechada sem merge.
- Uma planilha por warehouse; WHS obrigatório e único no arquivo; a importação afeta só aquela warehouse, inclusive a inativação de ausentes.
- Warehouses dinâmicas (não só Main/Service); nome novo exige confirmação do admin. ID interno estável permite renomear sem perder histórico. Comparação de WHS ignora só maiúsculas e espaços nas pontas.
- Brand Code globalmente único. Sessão escolhe a warehouse e só vê os produtos dela.
- 13 cabeçalhos fixos, em qualquer ordem: Brand Code, Brand Name, Category, Category1, BPU, Pallet Size, Weight AVG, BIN Location 1–4, Status, WHS. Weight AVG em gramas.
- Planilha inválida é rejeitada inteira, nunca importada em parte. Duplicatas exigem escolha explícita da linha. Arquivo vazio não desativa tudo.
- Importação em uma única transação, com autorização admin e revalidação no banco; qualquer erro reverte tudo.
- Transferência de produto entre warehouses bloqueada com sessão ativa na origem ou destino.
- BPU corrigido durante contagem: exige duas aprovações de admin, recalcula registros da sessão aberta sem recontagem física; fechados nunca mudam. **Ainda não implementado**: hoje edição de BPU fica bloqueada com equipe ou solo aberto.
- Lista fechada iniciada não recebe produtos novos, nem por admin.
- Exportação: ZIP com uma planilha por warehouse, ativos e inativos, com Status e WHS. Template Excel de upload disponível para download no app.

## Publicação da PR #70 (2026-09-18)
- Merge autorizado por Yuri; migration `warehouse_inventory_import` aplicada pelo conector. Produtos e sessões existentes associados a Main, com hashes de 14 tabelas idênticos antes e depois.

## Incidente de identidade de warehouse (2026-09-24, PR #75)
- O upload "BDS Main Warehouse" criou uma identidade nova e moveu só os códigos presentes; os ausentes ficaram em Main (criado pela migration, não por upload de Yuri). Isso escondia inativos na busca (caso Kinder: 9888 ativo; 9816, 9767, 6152, 2746, 1231 e 1213 inativos).
- Correção: criar warehouse nova é rejeitado se a planilha tiver Brand Code já cadastrado. Renomear deve preservar o ID.
- Recuperação aplicada com `supabase/maintenance/recover-split-inventory.sql` (padrão ROLLBACK, `apply=true` só com aprovação). Main ficou vazio e preservado por histórico; seletor de sessão omite warehouses sem produtos.
- Quatro sessões de teste foram encerradas com autorização de Yuri, sem apagar ou recalcular contagens.

## PINs e perfil Independente (2026-09-21, PR #72, não publicada)
- PIN de equipe e PIN pessoal continuam com 4 dígitos. Senha interna do Auth é derivada do par de PINs: atende a política do Auth, mas NÃO aumenta segurança nem substitui limite de tentativas. Nunca aparece no cliente ou em logs.
- Login tenta a senha derivada e, só em `invalid_credentials`, a senha PIN legada. Não redefinir credenciais existentes.
- Regressão vinda da PR #63: busca, layout e reconciliação ainda liam papel/equipe de `user_metadata`; contas novas caem na tela de lançamento e o Independente vê "Finalise". A correção usa identidade protegida, manda o Independente para `/monitor` e bloqueia lançamento inicial dele no servidor e na RLS.
- A PR #74 incorporou essas correções (sem o bloqueio total de busca do Independente, que contraria R02).

## Fluxo de equipes (2026-09-21 em diante)
- Contrato aprovado em [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md); substitui, para o novo fluxo, a contagem tripla fixa, a tolerância em gramas, o admin iniciando conciliação, o encerramento conjunto e a rejeição de todos os registros de quem saiu.
- Novo fluxo é opt-in por equipe; sessões legadas não são convertidas. Não manter dois fluxos completos indefinidamente.
- Resultados de equipe assinada são imutáveis, inclusive frente a correções posteriores de BPU ou cadastro.
- Autoria sempre derivada de `auth.uid()` e vínculo protegido, nunca de parâmetro ou metadata. Pedido, decisão e evento gravados na mesma transação; retry idempotente por UUID; revisão esperada impede decisão sobre tela desatualizada.
- Eventos de finalização não guardam quantidades, PINs nem motivo livre. Contador lê só os próprios eventos.
- Versões de resultado são seladas por revisão; só uma versão completa da revisão atual vai para assinatura; cancelar antes da primeira confirmação preserva a versão antiga.
- Sem limite máximo de participantes (3/4/5 são cenários de teste). Cadastro: Auth provisionado fora da transação com recuperação do mesmo pedido; nada parcial é publicado e nenhum cartão sai antes de completar.
- Seleção da lista delimitada Solo mostra Active e Inactive como a busca de contagem, ambos selecionáveis.
- Monitor distingue ausência, zero explícito, igualdade e diferença provisória; não resolve conciliação automaticamente. Poll de segurança de 15 s complementa o Realtime.

## Memória e laboratório (2026-10-05)
- Memória única em `docs/` na `main`; `CLAUDE.md` só importa `AGENTS.md`; `.claude/memory/`, handoffs e diários de estado removidos. Motivo: três memórias concorrentes se contradiziam e enganavam agentes novos.
- Laboratório no Codespace abandonado (cerca de 10 commits sem chegar a um servidor estável). Validação ponta a ponta passa a ser feita pelo agente em banco descartável, com prints e logs como evidência.

## Limpeza de sobras (2026-10-05)
- Removida a interface de admin antiga em `app/(admin)/` (rotas `/sessao`, `/inventario`, `/upload` fora da proteção `/admin` do `proxy.ts`; os dados já eram protegidos por `isAdmin()`), stubs `export {}`, `ProgressoClient` sem uso, logo do rebrand (`NextChainMark`) e ações legadas `uploadInventory` / `buscarInventarioParaDownload`. Motivo: superfície morta que confundia agentes e Yuri.
- Telas de admin só existem sob `/admin`.
- Branches antigas são apagadas pela automação manual `cleanup-branches.yml` (Actions → Run workflow), disparada por Yuri: simula por padrão, só apaga com `APAGAR` e nunca toca a branch padrão nem branches com PR aberta. Motivo: o ambiente do agente só pode gravar na própria branch. O GitHub apaga automaticamente a branch de cada PR mergeada.

## Prazo da contagem de 02/01/2027 (2026-10-05)
- Datas-limite: fluxo novo em produção até 27/11; contagem simulada com pessoas reais até 11/12; congelamento de 12/12 a 02/01. Motivo: blocos restantes são os mais delicados e fim de ano é janela ruim para publicar.
- Plano B: sem fluxo novo pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo. A sessão de equipes aberta desde 01/10 é de teste.

## Agente único (2026-10-05)
- O projeto passa a ter um único agente (Claude). `AGENTS.md` foi incorporado ao `CLAUDE.md` e removido; o CI recusa a volta de `AGENTS.md`. O trabalho útil do agente anterior é absorvido por revisão, sem menções a ele nos documentos.

## Auditoria da base do fluxo de equipes (2026-10-05)
- Base mantida, sem reescrita: autorização no banco, retry idempotente e histórico estão corretos e testados. O cadastro de equipes é mais complexo do que o necessário, mas fica; nenhum mecanismo desse porte nos blocos 5–12.
- Correções aprovadas para os próximos blocos: carregar o inventário uma vez e recarregar só as contagens; tela de equipe com o mesmo seletor "Add to Count / Edit Count" das telas atuais; monitor em `cases+units`; conferir o limite de tentativas de login do Supabase (PIN de 4 dígitos).
- Pesagem: guardar peso bruto, número de caixas e rodadas de cada lançamento por peso. Esses dados e o histórico de edições aparecem num menu admin "Audit Count", que exporta tudo o que cada pessoa lançou.
- PR só de documentação pode ser mergeada pelo agente após CI verde. Motivo: tirar de Yuri aprovações sem risco.
