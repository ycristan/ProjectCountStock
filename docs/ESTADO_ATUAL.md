# Estado atual e prioridades

Atualizado: 2026-09-03

## Situação observada
- Produção Vercel: deployment mais recente estava pronto e sem erros de build observados.
- A autorização protegida por `app_user_access` já está em produção, com as migrations 026 a 028 aplicadas.
- A aplicação tem fluxo de inventário, contagem em equipe, reconciliação, combinação e contagem solo.

## Funcionalidade em preparação — inventário e busca
- Cadastro manual de produto no Inventário, protegido para não ocorrer durante uma contagem.
- Visões administrativas separadas para produtos ativos e inativos.
- Busca de contagem com itens ativos primeiro e itens inativos também disponíveis e identificados.

## Prioridade P0 — segurança de autorização
Concluída em produção. A fonte de autorização é a tabela protegida `app_user_access`; permissões não dependem mais de dados editáveis pelo usuário.

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
