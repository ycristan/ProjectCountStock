---
name: feedback-reuse-components
description: "Reusar componentes/telas existentes em vez de reimplementar; padronização é prioridade do usuário"
metadata:
  node_type: memory
  type: feedback
---

Ao adicionar features com UI semelhante à que já existe, **reusar os componentes existentes** (ex.: `CountForm`, `BuscaClient`) em vez de escrever versões paralelas. Injetar o que varia (ex.: `onSubmit`) via prop, mantendo o comportamento padrão intacto.

**Why:** O usuário valoriza forte padronização e detesta divergência visual/comportamental. Caso real: a Solo Count foi reimplementada com formato `1cs 0un`, botão de cor diferente e uma caixa “Result” que não existe no fluxo normal — ele reclamou (“Achei que você reaproveitava códigos e deixava tudo mais padronizado”). O formato oficial de valores é `cases+units` (ex.: `10+21`), sem rótulos.

**How to apply:** Antes de criar qualquer tela/UI, procurar componente equivalente no repo e reusar (Ponytail rung 2). Se só o destino da ação muda, parametrizar via prop com default = comportamento atual. Nunca duplicar UI que já existe.
