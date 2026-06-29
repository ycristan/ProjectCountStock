---
name: feedback-git-workflow
description: "Padrão de git do projeto CountStock — sempre PR, nunca push direto na main salvo instrução explícita"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 30e6d838-8f3e-4fe9-93ee-1594f3d6dd51
---

Sempre criar PR para qualquer mudança de código. Push direto na main APENAS quando o usuário disser explicitamente ("mergeie direto", "manda na main", etc.).

**Why:** Usuário quer revisar antes de mergear. Push direto na main sem autorização é inaceitável e já gerou conflito.

**How to apply:** Toda mudança de código → branch + PR. Nunca presumir que push direto está OK. Se em dúvida, perguntar antes de agir.
