# Estado — 2026-10-05

Reescrever do zero a cada PR. Máximo 40 linhas. PRs, migrations e deploy: consultar os conectores.

## Prazo
Próxima contagem oficial de equipes: **02/01/2027**. Datas-limite (entregar antes se possível):
- até 27/11: fluxo novo completo, testado e publicado em produção;
- até 11/12: contagem simulada com pessoas reais em warehouse de teste;
- 12/12 a 02/01: produção congelada, só correção urgente.
Plano B: sem fluxo novo pronto em 27/11, publicar só a correção do Independente no legado e contar 02/01 no fluxo antigo.

## Em produção
`main` com inventário por warehouse, ZIP e recuperação BDS aplicada. Fluxo de equipes publicado ainda é o legado de três pessoas, com a regressão do Independente (abaixo).

## Em andamento
- Fluxo novo de equipes na PR #79: blocos 1–5 prontos e validados no CI, não publicados. Próximo: bloco 6 (comparação com a tolerância revisada de 2%).
- Regras revisadas com Yuri em 2026-10-05: substituição e Independente compartilhado adiados; contador ausente simples; assinatura por PIN + nome completo; lista de ativos não contados antes do zero.
- Blocos restantes para 02/01: 6, 7, 8, 11, 12. Menu "Audit Count" no bloco 12.

## Decisões pendentes de Yuri
1. Encerrar a sessão de equipes de teste aberta desde 01/10 (sem equipes)? Só com autorização.
2. Pesagem: o legado nunca guardou peso bruto e caixas. Guardar esses dados para o "Audit Count" é funcionalidade nova; confirmar se vale fazer.

## Problema conhecido em produção
Regressão do Independente (vinda da PR #63): contas de equipe criadas depois da #63 caem na tela de lançamento e o Independente vê "Finalise". Correção na #79, não publicada. Nenhuma contagem de equipe programada antes de 02/01/2027.

## A verificar
- Limite de tentativas de login do Supabase (PIN de 4 dígitos).
- Inventário BDS: 2.301 produtos (460 ativos / 1.841 inativos) contra 2.295 (446 / 1.849) logo após a recuperação. Sem registro da mudança.
- Backup de 2026-09-18 nunca foi restaurado em teste. Sentry hospedado sem leitura pelo agente.
- Contagem por peso no legado: "adicionar rodada" e reconciliação por peso quebradas em agosto; sem registro de correção.

## Backlog aprovado, não iniciado
- Aprovação dupla de BPU; itens desconhecidos com foto; Inventory manual/toggle/filtros; código de barras; padronização visual; assinatura desenhada; ajuste pós-assinatura; substituição e Independente compartilhado.
