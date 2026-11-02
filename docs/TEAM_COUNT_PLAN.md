# Plano do fluxo de equipes

Contrato: [TEAM_COUNT_FLOW.md](./TEAM_COUNT_FLOW.md). Aceitação: [TEAM_COUNT_TEST_MATRIX.md](./TEAM_COUNT_TEST_MATRIX.md).
Plano de nove entregas aprovado por Yuri em 2026-09-21 e refinado em blocos curtos em 2026-09-24. **Vale a numeração de blocos abaixo**; as "entregas" citadas no contrato e na matriz correspondem à coluna da direita.
Aprovar o plano não autoriza merge nem migration em produção. Em que bloco estamos: ver [ESTADO.md](./ESTADO.md).

| Bloco | Escopo | Entrega |
|---|---|---|
| 1 | Base atualizada com o inventário por warehouse | — |
| 2 | Confirmação confiável no monitor | — |
| 2A | Lista delimitada Solo com Active/Inactive | — |
| 3A | Cadastro variável: armazenamento transacional e retry | 3 |
| 3B | Cadastro variável: Auth recuperável, formulário, PIN e cartões | 3 |
| 4 | Contagem e monitor no modelo novo (N colunas, cegueira, WHS) | 3 |
| 5 | Finalização individual nas telas: pedido, bloqueio, aceite/rejeição | 4 |
| 6 | Comparação: igualdade, ausência/zero, métodos, tolerância de peso | 4 |
| 7 | Conciliação: registro do Independente, originais, submissão | 4 |
| 8 | Revisão do admin: recontagens seletivas, rodadas preservadas | 5 |
| 9 | ~~Saídas e substituição~~ ADIADO; contador ausente simples vai no bloco 11 | 6 |
| 10 | ~~Independente compartilhado~~ ADIADO | 7 |
| 11 | Assinatura por PIN + nome completo, ausências (contador e Independente), congelamento na 1ª confirmação | 8 |
| 12 | Encerramento por equipe, lista de ativos não contados, consolidado, Excel, Audit Count, verificação ponta a ponta | 9 |

Entregas 1 (contrato) e 2 (fundação: pessoas, vínculos, autoria, versões) foram feitas antes dos blocos. Blocos marcados com — são ajustes de base fora da numeração original.
Cada bloco inclui implementação e testes proporcionais. Nenhuma parte incompleta vai para produção.

## Antes de ativar em produção
Conferir estado real do banco e das branches, compatibilidade com o legado, backup/recuperação, migração testada em cópia sintética, ausência de sessões ativas e janela aprovada por Yuri. Não migrar sessões em andamento silenciosamente.

## Pontos técnicos a respeitar
- Pessoa ≠ participação: permite N contadores e Independente compartilhado sem duplicar identidade.
- Substituição por posição/item: registro anterior prevalece; substituto só preenche o que falta.
- Estados individuais separados do estado da equipe; encerrar a equipe não depende do fechamento geral.
- Comparar em unidades canônicas, com o método de cada lançamento; sem tolerância em gramas.
- Imutabilidade protegida também contra importação, correção de BPU, limpeza e operações privilegiadas.
- Sem reabertura depois da primeira assinatura.

## Código legado que o novo fluxo substitui
- `supabase/migrations/001_schema.sql`: papéis fixos C1/C2/Independente.
- `actions/sessao.ts` e o formulário de equipes: criação com papéis fixos.
- `actions/finalizacao.ts`: finalização sem aceite/rejeição do Independente.
- `supabase/migrations/017_tolerance.sql`: tolerância em gramas entre C1/C2 (substituída pela R05).
- `app/(counter)/monitor/_components/MonitorClient.tsx`: hoje envia o admin para verificar divergências.
- `actions/reconciliacao.ts`: precisa checar etapa e fechamento, não só o papel.
- `app/api/sessao/[id]/export/route.ts`: colunas fixas; o relatório novo precisa de participantes e versões preservadas.

## Qualidade
Reutilizar o formulário de quantidade; uma única comparação e uma única fonte de resultado oficial; conciliação inicial e recontagem usam o mesmo mecanismo com rodada/origem. Sem framework genérico de workflow nem serviço de notificação separado. Notificações de negócio persistem no estado e são recuperadas ao reconectar.

## Achados do teste de Yuri em 02/11 (preview das PRs #101 e #105)
Ordem proposta pelo agente; itens marcados "decisão" precisam do sim de Yuri antes do código.
1. **Finish x Confirm (bloqueia o merge da #101).** No formulário de contagem aparecem dois botões amarelos, e com o teclado aberto o "Finish my count" cobre o "Confirm Count". Correção: o Finish (equipe e Solo) só aparece na lista de busca; com um produto aberto, a única ação amarela é "Confirm Count". Depois: merge da #101, novo PIN do Solo, merge da #105. Na mesma PR (autorizado por Yuri em 02/11), trocar no CLAUDE.md a linha do Preview por: "Preview da Vercel usa o MESMO banco da produção. Testes manuais de Yuri no preview só na warehouse TESTE. O agente nunca cria dados no preview nem em produção para teste: usa banco descartável."
2. **Iniciar a sessão inteira (decidido 02/11).** Hoje o admin inicia cada equipe ("Start team counting"). Proposta: um botão "Start session count" inicia todas as equipes da sessão de uma vez, numa única transação. Equipe criada depois do início pode ser iniciada sozinha (raro, mas permitido).
3. **Tabela depois do encerramento.** A contagem ao vivo esconde equipe encerrada. Proposta: o admin continua vendo a tabela consolidada só para leitura, com os mesmos números do Excel final, no visual do app.
4. **Assinatura no aparelho de cada um (decidido 02/11; R11 revisado).** Cada um assina no próprio aparelho com o PIN pessoal; contadores ao mesmo tempo; Independente depois; admin confirma e encerra. Botão "Sign with Personal PIN Code". Ausências como hoje. Exige mudança no banco.
5. **Barra de navegação inferior (decidido 02/11: proposta visual primeiro, para Yuri aprovar antes do código).** No celular (contador, Independente, Solo e admin pelo celular): barra embaixo com as telas e o Log out; cabeçalho só com quem está logado. "Finish" fica fora da barra, como ação da tela. No notebook do admin, o menu de cima continua. O "Home" com a contagem em andamento (#105) vira a primeira aba.
6. **Teste automático com 9 usuários (prazo 11/12)** depois do item 4, para não ser refeito.
Parte D do visual (Sessões e Ajustes) fica parada até estes itens.
