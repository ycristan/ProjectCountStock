# Count Stock — instruções para o agente

Sistema web de contagem física de inventário cega em warehouse. Yuri é gerente de projeto e dono das regras de negócio, não é desenvolvedor. O agente faz todo o trabalho técnico e explica em português simples.

## Ao iniciar uma sessão
1. Ler `docs/ESTADO.md` (uma tela): em que pé o trabalho está e o próximo passo.
2. Conferir o estado real pelos conectores, nunca por documento: PRs abertas e branches (GitHub), migrations aplicadas (Supabase), deploy de produção (Vercel).
3. Se `docs/ESTADO.md` contradisser os conectores, os conectores valem. Corrigir o documento na próxima PR.
4. Antes de mexer em uma área, ler o documento dela (índice em `docs/README.md`).

## Memória do projeto
- A única memória é `docs/` na branch `main`. Não criar memória paralela (`.claude/memory`, handoffs, snapshots datados, cópias locais).
- O que dá para consultar não se escreve: PRs, commits, migrations, deploys, resultados de CI.
- Documento só guarda o que não existe em outro lugar: regras aprovadas, decisões e motivo, próximo passo.
- `docs/ESTADO.md` é reescrito do zero a cada PR, nunca acrescentado. Limite de 40 linhas, verificado no CI.
- `docs/DECISOES.md` só recebe acréscimos, 2 a 5 linhas por decisão, com data e motivo.
- Evidência de teste (commit, link de CI, contagem de testes) vai na descrição da PR, não nos documentos.
- Branch que não vai para a `main` logo não pode ser o único lugar de uma regra aprovada.

## Fluxo de mudança
- Sempre branch + PR. Nunca enviar direto para `main` e nunca fazer merge sem autorização explícita de Yuri naquela vez.
- Exceção: PR que altera só `docs/` (sem código, workflow, migration ou `CLAUDE.md`) o agente pode mergear sozinho depois do CI verde.
- Merge com squash.
- Supabase: toda mudança de schema, RLS ou função vira migration versionada em `supabase/migrations/`. Migration não é aplicada pelo merge; a PR diz se há aplicação manual e ela só ocorre com autorização.
- Preview da Vercel usa o MESMO banco da produção: nunca criar sessões, equipes, contagens ou alterar cadastro ali para teste.
- Testes com dados sintéticos em banco descartável (runner do GitHub ou container do agente).
- Após aprovar uma entrega, executar implementação, correções e testes sem pedir "continue" a cada passo. Parar só para decisão de negócio nova, acesso, custo ou autorização de produção.
- Ao fechar cada entrega, dizer explicitamente "TESTE MANUAL NECESSÁRIO" (com ambiente, perfil, passos e resultado esperado) ou "Nenhum teste manual necessário".

## Integrações
- GitHub, Supabase e Vercel: usar o conector ou a API oficial primeiro, nunca o navegador como substituto.
- Se faltar capacidade no conector, dizer isso logo, em linguagem simples, antes de sugerir passo manual.
- Não pedir a Yuri para repetir acesso, navegar por telas ou executar comandos que o agente possa fazer.
- Nada de clone, arquivos do projeto, tokens ou variáveis de ambiente no computador de Yuri.

## Segurança e dados
- Nunca registrar PINs, senhas, tokens, chaves ou dados pessoais em documentos, commits, logs, PRs ou Sentry.
- Autorização nunca vem de `user_metadata`: usar `app_user_access` e vínculos protegidos, conferidos no servidor e na RLS.
- Toda Server Action que altera dados valida identidade, papel e escopo no servidor. `service_role` só depois disso.
- Operações com várias gravações (equipes, sessões, importações) são transacionais.

## Qualidade
- Ponytail full antes e durante a escrita de código, e Ponytail Review no diff ao concluir. Menos código nunca justifica remover autorização, histórico, testes ou observabilidade.
- Reutilizar componentes existentes (`CountForm`, `SearchInput`, `ResultList` etc.); divergência visual entre telas é inaceitável.
- Nunca pular, desativar ou inverter teste para ficar verde. Build verde não prova fluxo de negócio.
- Não afirmar que algo foi validado sem evidência. Separar sempre: especificado, implementado, testado, publicado.
