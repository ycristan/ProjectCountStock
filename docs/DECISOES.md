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

## Correção: dados da pesagem (2026-10-05)
- O legado nunca guardou peso bruto nem número de caixas (as colunas não existem no banco; o schema antigo da memória estava errado). Guardar esses dados é funcionalidade nova, não regressão do fluxo novo; aguarda confirmação de Yuri.
## Revisão das regras do fluxo de equipes (2026-10-05)
- Tolerância de peso: 2% da maior quantidade (mínimo 1 unidade), no lugar de 50% do BPU; o Independente escolhe qualquer valor ou concilia. Motivo: erro de balança é proporcional ao peso, e "aceitar o maior" inflava o estoque.
- Substituição de contador (R09) e Independente compartilhado (R10) adiados: raros e caros para o prazo. Fica só "contador ausente" marcado pelo Independente (R08), senão a equipe trava.
- Assinatura por PIN + nome completo; desenho é melhoria futura. Ativo não contado só vira zero após confirmação do admin na lista de não contados. Erro após assinatura: ajuste separado por dois admins, sem editar o original (depois de 02/01).
- PIN de 4 dígitos mantido (poucas equipes, contas revogadas ao fim); só conferir o limite de tentativas do Supabase. QR Code futuro traz praticidade, não mais segurança: carrega a mesma credencial.

## Sessão de teste e pesagem (2026-10-05)
- Sessão de equipes de teste aberta desde 01/10 (sem equipes nem contagens) encerrada em produção com autorização de Yuri.
- Aprovado guardar peso bruto, número de caixas e rodadas de cada lançamento por peso no fluxo novo, para o Audit Count.

## Bloco 7 e dados da pesagem (2026-10-05)
- Contagem conciliada do Independente fica em registro próprio, só de acréscimo; as contagens dos contadores nunca mudam. Vale a última por produto e todas ficam guardadas. Motivo: rastreabilidade para o Audit Count.
- Envio ao admin só com todos os produtos resolvidos (igual, valor escolhido na tolerância ou conciliado); o resultado selado é criado na mesma transação.
- Pesagem: o banco recalcula a quantidade a partir das rodadas (caixas e peso bruto), da tara e do peso por unidade e recusa divergência. Fração de 0,7 ou mais sobe, calculada com 6 casas: o formulário arredondava para baixo alguns casos de 0,7 exato (1.070 g / 100 g dava 10, não 11), defeito que também atinge Solo e legado.

## Bloco 8 — revisão do admin (2026-10-07)
- Admin aceita o resultado selado (a equipe passa à coleta de assinaturas, R11) ou devolve produtos que a equipe contou; cada decisão guarda o admin, a versão e a hora, só de acréscimo. Dois admins ao mesmo tempo: vale o primeiro, o segundo recebe "a equipe mudou".
- Na rodada de recontagem só os produtos devolvidos aceitam novo valor; os demais mantêm o resultado e ficam sem nova escolha de tolerância. O valor oficial de um produto devolvido é a última recontagem da última rodada que o incluiu. Motivo: R07 ("itens não selecionados permanecem preservados").
- Cada reenvio gera nova versão selada; as anteriores ficam guardadas para o Audit Count.

## Bloco 11 — assinaturas, ausências e encerramento (2026-10-08)
- Assinatura por PIN na tela da coleta: o servidor entra com o PIN da própria pessoa e é a sessão dela que grava a assinatura. Motivo: o banco confere quem assinou, sem confiar na tela de quem coleta.
- Contador que sai durante a contagem (R08): o Independente marca, com motivo; o acesso é revogado e as contagens dele continuam valendo. Na assinatura, o Independente formaliza a ausência com o próprio PIN.
- Independente ausente: o admin registra o motivo, e a ausência só conta depois que uma testemunha confirma: um contador presente, com o PIN dele, ou um admin (pode ser o mesmo que registrou).
- Cancelar a coleta antes da primeira confirmação volta à revisão e sela de novo o mesmo resultado; a primeira confirmação congela a equipe; a última encerra e revoga todos os acessos na mesma transação.

## Credenciais por PIN (2026-10-07)
- O admin vê os PINs de propósito: precisa imprimir os cartões. Não é falha; o cuidado é não copiar PINs em documentos, commits, logs, PRs ou Sentry.
- Formato do PIN mantido até 02/01 (código de equipe com letras e teclado de 8 letras rejeitados: o teclado reduz as combinações e a troca mexe em login, cadastro e cartões perto do prazo).
- Ao encerrar a equipe, os logins dela são desativados, não só o acesso aos dados.
- Limite de tentativas do Supabase para login por senha: 1.800 por hora por endereço, não ajustável; como o login passa pelo servidor, todos contam como um endereço. Proteção própria do sistema contra tentativas erradas fica proposta para decisão de Yuri.

## Ativos não contados (2026-10-07)
- Ativo que nenhuma equipe contou significa não encontrado na warehouse. O admin só precisa dar ciência: um clique para a lista inteira, com registro de quem e quando. Sai o "mandar contar" (não havia quem contasse depois de todas as equipes encerradas).
- No Excel saem com 0 e a marcação "não contado" (opção A). Motivo: sem a linha, o estoque antigo do item continuaria no sistema da empresa.
- A lista vem ordenada por BIN para deixar visível um corredor inteiro esquecido, já que a divisão de corredores entre equipes não fica no sistema.
- Bloqueio do login após PINs errados: adiado por Yuri, não urgente; fica no backlog.

## Bloco 12 — fechamento, Excel e Audit Count (2026-10-07)
- Colunas do Excel final aprovadas por Yuri: uma aba por equipe (cada contador, conciliado, final e como resolveu), Consolidado só com o final de cada equipe, total e "Not counted", e Template Import Reconc idêntico ao atual.
- A ciência da lista de não contados congela o consolidado e fecha a sessão na mesma operação; se a lista mudou desde que o admin a viu, o sistema pede para revisar de novo.
- Audit Count é um item do menu admin com uma planilha por sessão: todas as contagens e versões substituídas, pesagens, conciliações, recontagens, decisões, ausências e assinaturas. Admins aparecem pelo e-mail; membros de equipe pelo nome (o login deles contém PINs e nunca é exibido).

## Correção do Independente separada da #79 (2026-10-07)
- Yuri aprovou publicar a correção do Independente no legado sozinha, sem esperar a #79. Motivo: a correção não pode depender da PR grande, e o Plano B precisa dela.
- A #79 corrigia só busca, layout e finalização; conciliação do contador, telas do admin e Excel final do legado continuavam lendo papel e equipe do `user_metadata`. A correção separada cobre todos esses pontos e repete a trava do banco que impede o Independente de lançar contagem inicial.
- Ao reabrir a #79 sobre a `main`, tirar dela as políticas `independent_no_initial_*` (já estarão na migration da correção).

## Ferramentas do agente (2026-10-15)
- Ponytail fica copiado no repositório (`.claude/skills/`, commit de origem no LICENSE): plugin instalado no computador de Yuri não carrega em sessão na nuvem.
- `.claude/settings.json` pede confirmação antes de aplicar migration, rodar SQL no Supabase, fazer merge de PR ou enviar para a `main`. Motivo: essas regras eram só texto e dependiam do agente lembrar.
- CI passa a rodar typecheck e lint em toda PR. O Next 16 removeu `next lint` e o lint durante o build; desde então nada checava o código além do build da Vercel.
- CLI do Supabase no CI fixada em 2.120.0 (a usada no último CI verde). Atualizar de propósito, numa PR própria.

## Proteção da `main` (2026-10-16)
- Ruleset `Main` no GitHub: só entra por PR com squash, sem aprovação obrigatória, checks `Typecheck and lint` e `memory` verdes, sem apagar a branch, lista de exceções vazia. Motivo: a trava local de push só pegava uma forma de escrever o comando; o servidor bloqueia qualquer caminho (git, conector, outro agente).
- Saem do `.claude/settings.json` as regras de push para a `main` (autorizado por Yuri); ficam as confirmações de migration, SQL e merge. O agente não altera as próprias permissões sem autorização explícita.
- Só são obrigatórios checks que rodam em toda PR: checks com filtro de pasta travariam PRs que não tocam essas pastas. Renomear um check obrigatório exige atualizar o ruleset na mesma hora.

## Aviso de lint reprova PR (2026-10-16)
- `npm run lint` roda com `--max-warnings 0`. Motivo: avisos como `react-hooks/exhaustive-deps` costumam ser bugs reais e passavam despercebidos. Corrigir o aviso; `eslint-disable` só com motivo escrito ao lado.
- Na data, a `main` e a #79 tinham um único aviso cada, o mesmo (tela de Combinação), corrigido nesta mudança.

## Migrations da #79 com data nova (2026-10-21)
- As 9 migrations do fluxo novo passam a ter data 20261021 (mesma ordem de antes), depois da última aplicada em produção (20261007120000). Motivo: com data antiga, a ferramenta do Supabase as trataria como fora de ordem.
- Saem da `reconcile_legacy_team_pin` as políticas `independent_no_initial_*`; ficam só na migration da #85, já aplicada.
- O teste de atualização do fluxo de equipes no CI parte do estado real de produção (20261007120000), e não mais de 20260917073526.
- Job do banco no CI fixado em `ubuntu-24.04`: o `ubuntu-latest` passou a ser 26.04, onde o Playwright 1.58.2 não instala o navegador. Atualizar Playwright e sistema juntos, numa PR própria.

## Migrations do fluxo novo aplicadas em produção (2026-10-21)
- Yuri autorizou aplicar as 9 migrations. Estrutura de produção conferida antes e depois contra o teste local: idêntica, sem nenhum dos 332 itens antigos alterado.
- O conector do Supabase trava (60 s, sem gravar nada) em qualquer comando com `drop`. Por isso a `team_flow_weighing` e a `team_flow_signatures` entraram em partes, e as remoções (versões antigas de `save_team_count` e troca de `team_admin_reviews_decision_check`) ficaram para o editor SQL do Supabase.
- Autorização de Yuri vale para a entrega inteira; o agente só para por decisão de negócio nova ou para ligar o fluxo para usuários.

## Sessões novas só no fluxo novo (2026-10-22)
- Yuri decidiu: com `TEAM_SETUP_ENABLED` ligado, toda sessão nova de equipes usa só o fluxo novo. Sessão que já tem equipe do legado continua no legado. Motivo: evitar escolher a tela errada no dia; o Plano B é desligar a variável.
- `?flow=1` na tela de equipes mantém o formulário legado alcançável para o teste de navegador dele; não aparece em nenhum menu.

## Backup automático e histórico do inventário (2026-10-28)
- Yuri confirmou: backup diário pelo GitHub Actions, criptografado, restaurado e conferido num banco descartável a cada execução, guardado 30 dias como artefato. Substitui o "nunca enviar backup ao repositório ou a Actions" de 2026-09-18. Motivo: o Supabase gratuito não tem backup acessível e o backup local nunca foi testado.
- Quem tiver a senha do backup e acesso ao repositório lê os dados, inclusive os logins de PIN de 4 dígitos: a senha vale tanto quanto a do banco.
- Contagem simulada com 9 pessoas trocada por: mini-teste com 1 equipe real (2 contadores + Independente) e teste automático do agente com 9 usuários em paralelo num banco descartável. Motivo: Yuri não consegue reunir 9 pessoas. O fluxo novo nunca foi usado por pessoas; a contagem grande validou só o fluxo antigo.
- Yuri aprovou histórico de alterações do inventário (quem, quando, antes e depois, inclusive importações), visível no Audit Count. Motivo: a mudança de 2.295 para 2.301 produtos no BDS é inexplicável, porque `inventory_items` não guarda data nem autor.

## Inventory com abas por warehouse (2026-10-22)
- Yuri decidiu: a tela Inventory terá uma aba por warehouse (até cerca de 5 previstas). Cadastro manual entra na warehouse da aba ativa; o download traz só a warehouse da aba (ativos e inativos), no lugar de "sempre o inventário completo". Motivo: deixar claro o que pertence a cada warehouse e evitar cadastro na warehouse errada.
- Sem exclusão de produto: desativar pelo toggle preserva o histórico das contagens.
- Implementação depois da contagem simulada, para não disputar atenção com o prazo de 27/11.

## Resultado do mini-teste do fluxo novo (2026-10-29)
- Yuri decidiu a ordem de fechamento da equipe: contadores assinam primeiro, o Independente por último, o admin confirma a finalização e só então os acessos de contadores e Independente são revogados. Substitui "Independente primeiro" (R11) e o encerramento automático na última assinatura (R12). Motivo: no teste o admin ficou sem tela ao fechar e o fluxo pareceu invertido.
- Cartões impressos com QR e PINs (um por pessoa, guardado até o fim) voltam a ser o "Print" das sessões novas: no fluxo novo tinham virado só a tabela. Cabeçalho com o nome de quem está logado volta em todas as telas de equipe.
- Yuri reprovou o visual: botões que parecem texto, telas genéricas, sem padrão, não pensadas para celular; o monitor perdeu as cores e o "flash" da tela do legado. O escopo e a data dessa padronização visual são decisão pendente de Yuri (prazo de 27/11).


## Visual "Chão de armazém" e padrão de navegação (2026-10-30)
- Yuri aprovou a proposta visual: sinalização industrial, amarelo de segurança sobre grafite, fundo concreto, números grandes. Contadores e Independentes usam só celular (mobile first, linguagem simples, um botão principal por tela); admins usam iPad e notebook (tabela larga ao vivo, com cores e flash).
- Padrão obrigatório em todas as telas: voltar sempre no canto superior esquerdo, abaixo do cabeçalho, dizendo para onde leva; logo leva ao início do perfil; título abaixo do voltar e ações secundárias à direita; ação principal embaixo e larga no celular. Implementado uma vez em `components/ui.tsx` (`AppHeader`, `PageTop`, `Button`, `Tag`); telas não criam estilo próprio de botão ou navegação.
- Motivo: no mini-teste os botões pareciam texto, o fluxo ficou confuso e cada tela tinha o voltar num lugar (ou nenhum).
## Skills de design e de método (2026-10-30)
- Yuri desistiu da UI/UX Pro Max (conteúdo genérico, PR #102 fechada) e pediu `frontend-design` (Anthropic, Apache 2.0) e Superpowers (obra, MIT). Copiadas para `.claude/skills/`, porque plugin não carrega na nuvem.
- Do Superpowers entraram só 4 skills: `systematic-debugging`, `verification-before-completion`, `test-driven-development`, `receiving-code-review`. Ficaram fora brainstorming, planos, worktrees, finalização de branch e o hook de início de sessão. Motivo: gravam specs e planos em `docs/superpowers/` (memória paralela), fazem merge local e impõem um fluxo próprio por cima do CLAUDE.md.

## Busca de produtos (2026-10-30)
- Yuri decidiu: a busca acha qualquer parte do nome, do código ou do BIN, ignorando hífen, espaço e maiúsculas ("009", "05" e "T-05" acham TESTE-009 no BIN T-05). Mais próximos primeiro: código ou BIN exato, depois começo do código ou BIN, começo do nome, e o resto. Vale para contador de equipe, Solo e montagem da lista do Solo.
- Substitui a regra antiga, não documentada, que escolhia o campo pelo primeiro caractere e só olhava o começo de códigos e BINs. Motivo: no teste de Yuri, código e BIN de letras não eram achados.

## Padronização visual de todo o app (2026-10-30)
- Yuri aprovou o plano completo: cantos de 4px em tudo (também nas telas de equipe), ícone sempre com texto, 5 tipos de botão, amarelo só para a ação principal, cabeçalho único para todos os usuários. Admin em partes: painel e menu novo; Inventory; Sessões e Ajustes. Abas por warehouse ficam para depois porque mudam o download.
- Tela do Solo aprovada após o teste de Yuri: o cabeçalho mostrava o login (os dois PINs) no lugar do nome. Regra: o cabeçalho nunca mostra login; o Solo mostra o nome digitado. "Finish count" pede confirmação.

## Contagem ao vivo consolidada no fluxo novo (2026-10-30)
- O fluxo novo trocou, sem decisão registrada, a tela única do admin do fluxo antigo (todas as equipes, colunas por pessoa, linha piscando) por um monitor por equipe. Yuri apontou a regressão e aprovou a tela 5b: todas as equipes numa tabela ao vivo, com placas por equipe, totais e filtros por equipe, status e produto. Prioridade antes do Inventory.
- Sem coluna de hora da última entrada: a leitura das contagens não traz a hora; incluir exigiria mudar função do banco. As contagens que chegam com a tela aberta sobem para o topo e piscam.

## Teste de Yuri no preview: início, assinaturas e navegação (2026-11-02)
- O admin inicia a sessão de equipes inteira com um botão; uma equipe criada depois do início ainda pode ser iniciada sozinha (raro).
- Assinatura no próprio aparelho, com o PIN pessoal: contadores ao mesmo tempo, Independente depois, admin confirma e encerra. Substitui a assinatura de todos num único aparelho (R11 de 29/10). Botão "Sign with Personal PIN Code", para não confundir com o PIN da equipe. Motivo: cada um confirma o encerramento da própria contagem, sem aglomerar todos num aparelho.
- Barra de navegação inferior no celular: proposta visual primeiro, aprovação de Yuri antes do código.

## Assinatura desenhada descartada (2026-11-02)
- Com a assinatura no próprio aparelho, a assinatura oficial é o PIN pessoal. A assinatura desenhada (dedo/caneta), antes melhoria futura, sai do backlog.

## PIN do Solo mantido (2026-11-02)
- Yuri decidiu não trocar o PIN do Solo que apareceu no cabeçalho do preview em 30/10: só ele viu. O cabeçalho já não mostra login (#101).

## Paleta Next Chain (2026-11-02)
- Yuri escolheu a paleta da marca NEXT CHAIN, a mesma para toda a suíte de aplicativos (CountStock é o primeiro módulo): Graphite `#353535`, Yale Blue `#284B63`, Stormy Teal `#3C6E71`, Dust Grey `#D9D9D9`, White. Substitui o amarelo de segurança de 30/10; cantos, botões, cabeçalho e fontes seguem iguais.
- Uso: Graphite no cabeçalho, texto e painéis escuros; Yale Blue na ação principal e no passo atual; Stormy Teal como destaque sobre o Graphite (menu atual, avatar, selo); Dust Grey em bordas e chips de BIN. Tons de apoio (fundo `#F1F3F3`, cinzas de texto) derivados, fora da paleta.
- Cores de status (verde, laranja, azul, vermelho) não mudam. Sobre o Graphite só entram como etiqueta com texto branco: texto colorido direto no fundo escuro fica abaixo de 3:1.
- Mercado da marca: Irlanda e União Europeia (consulta do nome em IPOI e EUIPO ainda pendente).

## Todas as telas no padrão novo (2026-11-02)
- Yuri apontou que Solo do admin, Sessions, Audit e Settings ainda estavam no visual antigo (cinzas e azuis padrão do Tailwind). Foram migradas todas as telas que ainda usavam esse estilo: admin (Solo, Sessions, Audit, Settings, nova sessão, equipes, reconciliação, Combinação, impressão, recuperação) e contador (monitor, reconciliação, finalizar).
- Regra: tela nova ou antiga usa só `components/ui.tsx` (`PageTop`, `Button`, `Tag`, `Notice`, `cardClass`, `inputClass`, tabela com cabeçalho grafite, controle segmentado). Cor de classe numerada do Tailwind (`slate`, `blue`...) não se usa mais.
- Textos, papéis e campos que os testes de navegador leem foram mantidos (`Next →`, `← Back`, `Logins Generated`...). O cartão de impressão A4 continua preto e branco de propósito.

## Tolerância de peso fora do Settings (2026-11-02)
- Yuri confirmou os 2% fixos da R05 e mandou tirar do Settings o campo "Default Weight Tolerance (g)": o fluxo novo nunca o leu. O valor já salvo (`app_settings.default_tolerance_g`) fica intacto e continua sendo copiado para sessões novas, porque o fluxo antigo (Plano B de 02/01) ainda o usa.
- Remover a coluna e o uso no fluxo antigo junto com a retirada dele, depois de 02/01.

## Barra inferior, Hold to finish e confirmação do app (2026-11-02)
- Yuri escolheu a proposta B: no celular, as telas viram abas numa barra embaixo e a última aba, "Me", mostra quem está logado, o Log out e (admin) Settings. No notebook o menu de cima continua. A barra some quando o teclado está aberto.
- Finish da equipe e do Solo: "Hold to finish" (segurar 4 s, contagem 4-3-2-1; soltar antes cancela) e depois a confirmação. Substitui o botão com confirmação de 30/10 também no Solo.
- Toda confirmação é uma janela do próprio app (`components/confirm.tsx`), nunca a caixa do navegador; as 8 que existiam foram trocadas. Motivo: a caixa do navegador quebra o visual e não segue o padrão das telas.

## Inventory por warehouse e Audit Inventory (2026-11-03)
- Yuri decidiu: uma aba por warehouse, sem aba com todas juntas; warehouse sem produtos não ganha aba. Colunas com o nome da planilha, Status primeiro, WHS oculta; cabeçalho fixo, rolagem dentro da tabela, filtros por coluna, toggle de Status, cadastro manual.
- Download volta a ser o ZIP com todas as warehouses (revoga a parte de download de 22/10). Import continua 1 WHS por arquivo: arquivo misturado segue bloqueado, porque um WHS errado numa linha move produto sem ninguém ver (incidente de 24/09).
- Cadastro manual com Brand Code de outra warehouse é bloqueado com aviso; transferência fica para depois.
- Audit Inventory (histórico aprovado em 28/10) gravado por trigger no banco, só de acréscimo, com período e produtos selecionáveis na tela e no Excel. Começa quando a migration for aplicada; o passado não existe no banco.
- Prioridade: Inventory antes dos itens 2/3/4/6 de equipes. Yuri assume o risco no prazo de 27/11; Plano B continua valendo.

## Idioma da aplicação (2026-11-03)
- Yuri: a aplicação é exclusivamente em inglês britânico. Ele viu texto em português na tela Inventory (link da conferência de recuperação, só no preview). Regra nunca estava escrita em `docs/`, por isso escapou.
- Varredura completa (português e grafia americana) é entrega própria, depois do Inventory. Todo texto novo a partir de agora já sai em inglês britânico.

## Inventory: tela revista por Yuri (2026-11-03)
- Sai a busca geral: os filtros por coluna (estilo Excel: ordenar, limpar, buscar, "(Select all)", Apply) a substituem. "BIN Location" vira um cabeçalho só sobre as colunas 1–4.
- A página rola: título, abas e menu saem de vista e o cabeçalho da tabela gruda no topo da tela, para a lista ter o máximo de espaço. A janela de filtro usa a altura da tela.
- Motivo: a primeira versão (busca + filtro abaixo do nome + janela espremida) foi entregue sem conferência visual; agora toda mudança de tela é conferida em captura antes de ir para a PR.

## Filtros, fontes, região e ritmo de PRs (2026-11-03)
- Yuri pediu, no filtro de Brand Code, lista de códigos separados por vírgula com seleção exata; códigos inexistentes são avisados antes do Apply. Ordem natural e lista completa no filtro, porque o código 3 sumia além dos 200 primeiros e 1111 vinha antes de 5.
- Fontes passam a ir dentro do projeto (`app/fonts`, licenças OFL): o build baixava do Google e falhou 2 vezes em 03/11, o que travaria a republicação da produção.
- Achado: a Vercel roda em iad1 (EUA) e o Supabase em eu-west-1 (Irlanda); cada consulta cruza o Atlântico. Suspeito principal da demora de 3 a 4 s. Yuri autorizou a PR que muda para dub1; o ganho será medido por Yuri antes e depois, porque o plano Hobby não guarda log útil.
- Yuri decidiu: uma PR de cada vez, na branch única do agente, para não virar bagunça.
