# Estado — 2026-10-28 (tarde)

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, contar 02/01 no fluxo antigo (já com a correção do Independente).

## Em produção
`main` com inventário por warehouse, ZIP, recuperação BDS, arredondamento por peso corrigido e correção do Independente no legado (#85). Código do fluxo novo na `main` (#91, #93) com `TEAM_SETUP_ENABLED` desligado; as 9 migrations aplicadas em 21/10. Solo é usado quase todo dia.

## Em andamento
- Backup diário em produção desde 28/10 (#95; ARQUITETURA, "Backup do banco"): primeira execução restaurada e conferida tabela a tabela. Senha do banco redefinida por Yuri em 28/10; sistema testado depois.
- Próximos, antes da simulação: Sentry nos erros mostrados nas telas de equipe; teste em navegador da contagem por peso (Solo, legado e fluxo novo).
- Depois da simulação: histórico de alterações do inventário (aprovado em 28/10) e Inventory com abas.
- Limpeza pequena: remover a prévia da recuperação de warehouses (link, página, código e testes).

## Plano de ativação
1–3. Feito: teste com a estrutura de produção, migrations aplicadas (21/10), merge da #91 com a variável desligada.
4. Ligar `TEAM_SETUP_ENABLED` na Vercel e fazer a contagem simulada em warehouse de teste.

## Decisões pendentes de Yuri
- Dia da simulação; warehouse de teste; pessoas (2 equipes, 9 pessoas).
- `solo_sessions.access_pin` sem uso: remover depois de 02/01 (precisa de `drop`, que o conector não roda).

## A verificar
- Teste manual (#90) e correção do Independente (#85) em tela: entram na contagem simulada.
- Peso: "Add to Count" não oferece peso, por desenho; pelo código, "Edit Count" e a conciliação do fluxo novo oferecem. Yuri relata que a edição não oferece: confirmar no teste de navegador. Conciliação do legado tem peso só com uma pesagem.
- Inventário BDS: 2.301 produtos contra 2.295 logo após a recuperação; sem como explicar (sem data nem autor).
- Conector do Supabase: lê e grava, mas trava em qualquer `drop`.
- Sentry só capta falhas não tratadas; erros mostrados na tela não chegam lá.

## Backlog aprovado, não iniciado
- Bloqueio do login após PINs errados; aprovação dupla de BPU; itens desconhecidos com foto; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
