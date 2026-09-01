# Estado atual e prioridades

Atualizado: 2026-09-01

## Situação observada
- Produção Vercel: deployment mais recente estava pronto e sem erros de build observados.
- O repositório possui memória detalhada do Claude, agora complementada por esta documentação compartilhada.
- A aplicação tem fluxo de inventário, contagem em equipe, reconciliação, combinação e contagem solo.

## Prioridade P0 — segurança de autorização
A auditoria identificou que permissões de administrador e contador dependem de `user_metadata` no Supabase. Esse campo pode ser alterado pelo próprio usuário autenticado e não pode ser usado como chave de autorização.

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
