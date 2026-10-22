# Contagem simulada de equipes — roteiro

Objetivo: provar o fluxo novo de ponta a ponta com pessoas reais, em produção, num warehouse de teste, antes de 11/12. Regras: [contrato](./TEAM_COUNT_FLOW.md). Cenários de referência: [matriz](./TEAM_COUNT_TEST_MATRIX.md).

## O que muda quando o botão `TEAM_SETUP_ENABLED` é ligado (Vercel)
- **Admin:** aparece o item "Audit Count" no menu. Toda sessão nova de equipes usa só o fluxo novo (decisão de 22/10); a lista de sessões leva cada sessão à tela certa.
- **Pessoas de equipes do fluxo novo:** depois do login com PIN, vão para a tela "Your team access" e dali para a equipe.
- **Continua igual:** contagem Solo, inventário, importação e sessões antigas de equipes. As equipes antigas seguem no fluxo de 3 pessoas.
- **Desligar o botão** volta ao fluxo antigo para sessões novas (Plano B). Os dados gravados continuam no banco.

## Antes do dia
1. Warehouse de teste com inventário importado: produtos ativos e inativos, alguns com peso médio (contagem por peso) e alguns com BPU 1.
2. Pessoas: 2 equipes, a **A** com 3 pessoas (2 contadores + Independente) e a **B** com 4 (3 contadores + Independente). Mais 2 admins. Total de 9 pessoas, uma por celular.
3. Combinar quais produtos cada equipe conta. Ao menos 1 produto deve ser contado pelas duas equipes, e alguns produtos ativos não devem ser contados por ninguém.
4. Ligar o botão na Vercel no dia, antes de começar, e conferir que a contagem Solo continua funcionando.
5. Aviso: o resultado fechado é **permanente** (R12). A sessão de teste fica para sempre no histórico do warehouse de teste.

## Roteiro (marcar ✔ ou anotar o problema)
**1. Montagem (admin)**
- [ ] Criar sessão de equipes no warehouse de teste com 2 equipes; o sistema abre a montagem do fluxo novo.
- [ ] Preencher a equipe A (3 pessoas) e a equipe B (botão "Add counter" para 4 pessoas). Clicar em "Create Teams and Generate Logins" e imprimir os cartões.
- [ ] Em cada equipe, clicar em "Open monitor" e depois em "Start team counting".

**2. Contagem (contadores)**
- [ ] Cada um entra com o código da equipe e o PIN pessoal e vê só a própria contagem.
- [ ] Equipe A: todos lançam igual em 3 produtos; contagem por peso de 100 e 98 unidades em 1 produto; um contador lança 0 explícito num produto.
- [ ] Equipe B: lançamentos diferentes (10/10/12) num produto; um contador deixa de contar um produto que os outros contaram.
- [ ] Independente: consulta produtos, mas não consegue lançar contagem. Vê os números provisórios mudando sem recarregar a tela.
- [ ] Equipe B: o Independente marca um contador como ausente ("Mark absent"), com motivo. O ausente perde o acesso.

**3. Finalização individual**
- [ ] Cada contador clica em "Finish my count". Depois disso não consegue editar.
- [ ] O Independente rejeita 1 pedido ("Reject"); a pessoa volta a contar e pede de novo. Depois, aceita todos.

**4. Comparação e conciliação (Independente)**
- [ ] Equipe A: o produto de peso 100/98 aparece como "Within weight tolerance". O Independente escolhe um dos valores.
- [ ] Equipe B: os produtos divergentes e o não contado aparecem como "Needs reconciliation". O Independente confere fisicamente e lança o valor conciliado.
- [ ] "Submit to admin" só libera com tudo resolvido.

**5. Revisão do admin**
- [ ] Equipe B: o admin devolve 1 produto para recontagem; o Independente reconta e reenvia.
- [ ] Os dois admins tentam decidir a mesma equipe ao mesmo tempo: só uma decisão vale.
- [ ] O admin aceita as duas equipes ("Accept result").

**6. Assinaturas**
- [ ] O Independente assina primeiro; depois os contadores, cada um com o próprio PIN ("SIGN BY PIN CODE").
- [ ] Equipe B: o contador ausente é formalizado pelo Independente, com motivo.
- [ ] Antes da primeira assinatura, o admin cancela a coleta uma vez e aceita de novo. Depois da primeira assinatura, o cancelamento não aparece mais.
- [ ] Após a última assinatura, a equipe fecha e os logins dela param de funcionar.

**7. Fechamento e Excel (admin)**
- [ ] Em "Close the count", a lista mostra os produtos ativos não contados, por BIN. Clicar em "Acknowledge and close the count".
- [ ] Baixar "Download final Excel": uma aba por equipe; o produto contado pelas duas equipes aparece somado no Consolidado; não contados com 0 e "Not counted"; inativos não contados sem linha.
- [ ] Baixar "Download Audit Count" e conferir contagens, pesagens, conciliações, decisões, ausências e assinaturas.
- [ ] Tentar alterar qualquer coisa depois do fechamento: nada pode mudar.
