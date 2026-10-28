# Estado — 2026-10-28 (noite)

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: mini-teste com 1 equipe real e teste automático com 9 usuários em paralelo (decisão de 28/10);
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, arredondamento por peso corrigido e correção do Independente no legado (#85). Código do fluxo novo na `main` (#91, #93) com `TEAM_SETUP_ENABLED` desligado; as 9 migrations aplicadas em 21/10. Solo é usado quase todo dia.

## Em andamento
- Backup diário em produção desde 28/10 (#95; ARQUITETURA, "Backup do banco"): primeira execução restaurada e conferida tabela a tabela. Senha do banco redefinida por Yuri em 28/10; sistema testado depois.
- 29/10: mini-teste do fluxo novo com 1 equipe real (roteiro curto em SIMULACAO_EQUIPES.md). É o primeiro uso do fluxo novo por pessoas.
- Agente: teste automático com 9 usuários em paralelo; Sentry nos erros mostrados nas telas de equipe; teste em navegador da contagem por peso.
- Depois da simulação: histórico de alterações do inventário (aprovado em 28/10) e Inventory com abas.
- Limpeza pequena: remover a prévia da recuperação de warehouses (link, página, código e testes).

## Plano de ativação
1–3. Feito: teste com a estrutura de produção, migrations aplicadas (21/10), merge da #91 com a variável desligada.
4. Ligar `TEAM_SETUP_ENABLED` na Vercel (autorização de Yuri) e fazer o mini-teste em warehouse de teste.

## Decisões pendentes de Yuri
- Warehouse de teste do mini-teste; autorização para ligar `TEAM_SETUP_ENABLED`.
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Teste manual (#90) e correção do Independente (#85) em tela: entram na contagem simulada.
- Peso: "Add to Count" não oferece peso, por desenho; pelo código, "Edit Count" e a conciliação do fluxo novo oferecem. Yuri relata que a edição não oferece: confirmar no teste de navegador. Conciliação do legado tem peso só com uma pesagem.
- Inventário BDS: 2.301 produtos contra 2.295 logo após a recuperação; sem como explicar (sem data nem autor).
- Conector do Supabase: lê e grava, mas trava em qualquer `drop`.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
