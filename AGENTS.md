# Count Stock — instruções de trabalho

## Fonte de verdade
Leia `docs/README.md` antes de propor ou alterar qualquer coisa. Os documentos em `docs/` são a referência compartilhada entre Codex e Claude. O `CLAUDE.md` e `.claude/memory/` permanecem como histórico e compatibilidade, mas não substituem os documentos atuais.

## Papéis
- Yuri define o processo de inventário e aprova mudanças de produto.
- O agente é responsável por traduzir isso em solução técnica segura, explicar decisões em linguagem simples e executar o trabalho técnico.
- Não presumir conhecimento técnico do usuário.

## Integrações e ambientes
- Para GitHub, Supabase, Vercel e demais serviços conectados, usar primeiro o conector ou a API oficial disponível na sessão.
- Não usar navegador ou automação de tela como substituto de um conector disponível.
- Se uma capacidade necessária não estiver realmente exposta pelo conector, informar isso imediatamente, em linguagem simples, antes de sugerir qualquer passo manual.
- Não pedir ao Yuri para repetir informações de acesso, navegar por telas ou executar passos que o conector disponível possa realizar.
- Nunca tentar autenticar sessões paralelas, abrir telas de login ou manipular abas pessoais do usuário sem pedido explícito.

## Fluxo de mudança
- Trabalhar em branch; nunca enviar diretamente para `main` sem autorização explícita.
- Abrir PR com resumo em português simples, riscos, validações e qualquer passo manual necessário.
- Para Supabase: toda mudança de schema, RLS ou função precisa de migration versionada no repositório. Não fazer mudança manual sem registrar a migration correspondente.
- Antes de mudar autenticação, RLS, estados de sessão ou inventário, ler `docs/ARQUITETURA.md` e `docs/DECISOES.md`.

## Segurança e dados
- Nunca registrar PINs, senhas, tokens, chaves ou dados pessoais em Markdown, commits, logs ou PRs.
- Não autorizar operações por `user_metadata`; consultar `docs/ESTADO_ATUAL.md` para a correção de segurança prioritária.
- Toda Server Action que altera dados deve validar identidade, função e escopo do recurso no servidor.
- Preferir operações transacionais para criação/remoção de equipes, sessões e importações.

## Qualidade
- Atualizar `docs/ESTADO_ATUAL.md` e `docs/DECISOES.md` quando uma decisão relevante for tomada.
- Testar alterações na proporção do risco. Não afirmar que algo foi validado sem evidência.

## Contrato de equipes
Antes de alterar fluxo de equipes, ler integralmente docs/TEAM_COUNT_FLOW.md, docs/TEAM_COUNT_PLAN.md e a matriz docs/TEAM_COUNT_TEST_MATRIX.md. Usar IDs de regras/cenários na PR; distinguir planejado, implementado, executado e publicado. Não remover proteções para fazer teste passar.
