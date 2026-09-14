# Estado atual e prioridades

Atualizado: 2026-09-01

## Situação observada
- Produção Vercel: deployment mais recente estava pronto e sem erros de build observados.
- O repositório possui memória detalhada do Claude, agora complementada por esta documentação compartilhada.
- A aplicação tem fluxo de inventário, contagem em equipe, reconciliação, combinação e contagem solo.

## Prioridade P0 — segurança de autorização
A auditoria identificou que permissões de administrador e contador dependem de `user_metadata` no Supabase. Esse campo pode ser alterado pelo próprio usuário autenticado e não pode ser usado como chave de autorização.

A correção está em preparação na branch `codex/security-authorization-hardening`. A escolha técnica é uma tabela protegida, `app_user_access`, porque a autorização passa a ter efeito imediato — sem esperar a renovação de token.

A correção deve:
1. Mover função e vínculos de acesso para dados protegidos (`app_metadata` ou tabela de perfil controlada pelo banco).
2. Atualizar as políticas RLS e o `proxy.ts`.
3. Criar verificações centralizadas para administrador, contador e contador solo.
4. Proteger todas as Server Actions, especialmente as que usam `service_role`.
5. Validar que um contador não consegue administrar inventário, equipes ou sessões.

Nenhuma nova funcionalidade deve passar à frente desta correção.

## Depois da P0
1. Contagem por peso: permitir adicionar rodadas e reconciliar por peso.
2. Melhorar busca de inventário: filtro ativo/inativo, confirmação para itens inativos e informações de localização.
3. Especificar separadamente a evolução do fluxo de finalização entre administrador e independente.
4. Criar testes automatizados, CI, lockfile e corrigir o script de lint.
5. Fazer limpeza de rotas/componentes legados somente após testes de regressão.

## Riscos conhecidos
- Operações de criar/apagar equipes ou importar inventário fazem várias alterações separadas; migrar gradualmente para operações transacionais.
- PINs de quatro dígitos exigem proteção contra tentativas repetidas e auditoria de login.
- Arquivos XLSX precisam de validação de tamanho, estrutura e conteúdo antes de alterar o inventário.

## Testes isolados de Inventory — 2026-09-14
- PR #69 (rascunho): https://github.com/ycristan/ProjectCountStock/pull/69
- Execução https://github.com/ycristan/ProjectCountStock/actions/runs/34851928747 no commit 1f7282016b53fe9d03d2ed36c4f176ef73f75b17: 11 testes, 8 passaram, 3 falharam, nenhum skip/TODO.
- Falhas de contrato na barreira das Server Actions: gravação administrativa em solo fechado, inclusão em lista iniciada e edição direta de BPU durante solo ativo.
- Dependências de banco simuladas; não prova ausência de proteções SQL/RLS em produção. Aprovação dupla, recálculo persistido, peso e relatórios fechados ainda não testados integralmente.
- Nenhuma alteração de aplicação/migration, nenhum merge. Regras consolidadas na PR #68 ainda separada.

## Correções dos três contratos — 2026-09-14
- PR #69 agora contém correções de Server Actions e migration proposta; deixou de ser apenas diagnóstico.
- Commit validado: 625a6e5903e94e7168f02e97e124845c66e3e6bb. Aplicação: 24 testes passaram (https://github.com/ycristan/ProjectCountStock/actions/runs/34855714811). Banco descartável: 30 testes passaram (12 existentes + 18 novos), migration aplicada e lint sem erros (https://github.com/ycristan/ProjectCountStock/actions/runs/34855714520). Build Vercel Preview passou.
- Consulta somente leitura à produção confirmou políticas administrativas sem guardas de estado e ausência de triggers nas quatro tabelas verificadas. Nenhuma mudança foi aplicada ao banco real.
- Migration 20260914142358_solo_inventory_write_guards.sql protege registros solo encerrados, lista iniciada e BPU durante solo aberto; inclui marcador durável de início e bloqueios transacionais.
- Para publicar: revisão e autorização explícita, aplicar migration no banco correto, depois merge/deploy. Preview usa banco de produção e não substitui testes isolados.
- Escopo ainda separado: aprovação dupla/reprocessamento em equipes, warehouses e renderização histórica dos relatórios. Não houve teste de carga concorrente. Mais detalhes em tests/inventory/README.md.
