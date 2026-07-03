---
name: project-count-stock-snapshot-2026-07-03
description: "Count Stock — estado + HANDOFF em 2026-07-03 (supera 2026-07-01): #48 (não-contado=0) mergeada, #46 revertido (lição proxy.ts), feature inputs em branco PR #49 ABERTA/testada mas NÃO mergeada. Continuar em outro computador."
metadata:
  type: project
  updatedOn: 2026-07-03
---

# Count Stock — Snapshot + HANDOFF 2026-07-03 (supera 2026-07-01)

> **Ler isto ao retomar.** Sessão iniciada num computador, continua em outro. Este arquivo é a fonte da verdade do estado atual.

## 🔴 PENDÊNCIA CRÍTICA — retomar exatamente por aqui
**PR #49 ("inputs de contagem em branco") está ABERTA, testada pelo usuário e com ponytail-audit limpo, mas NÃO foi mergeada.** O usuário interrompeu o merge para salvar a memória primeiro. **Próximo passo = squash-merge da #49.** O usuário já autorizou ("mergeie, e qualquer coisa eu dou rollback").

## O que foi feito na manhã de 2026-07-03
1. **Confirmado que a regra "item não contado = 0" NÃO se aplica à contagem solo.** O export solo (`app/api/solo/[id]/export/route.ts`) monta linhas apenas de `solo_entries` (itens efetivamente contados); o inventário é só lookup. A regra do merge=0 vale só no fluxo de equipe (Excel de equipe, tela Merged, RPC `combine_session_results`).
2. **Confirmado que produção está intacta** após a reversão do #46 (commit `b7d17aa`, build READY, login funcionando).
3. **NOVA FEATURE — PR #49 "inputs de contagem em branco":** os campos **Pallets / Cases / Units** passam a iniciar **vazios** em vez de "0", para evitar o erro clássico de digitação: usuário desatento não apaga o "0", digita "1" e o campo vira "10".
   - **Vazio confirmado = 0.** O submit **já** coagia `"" → 0` via `parseInt(x) || 0` — **nenhuma lógica nova**. Só mudou o valor inicial dos 3 `useState` + `placeholder="0"` cinza.
   - Arquivo único: `app/(counter)/busca/_components/CountForm.tsx` (~6 linhas). Vale para contagem de **equipe e solo** (mesmo componente).
   - Comportamento: contagem nova/additive = vazio; **edição** = mostra o valor salvo; campos **travados** (BPU=1 / sem pallet) seguem "0".
   - Testado pelo usuário. ponytail-audit: `Lean already. Ship.`

## Estado do repositório / produção
- **main = commit `b7d17aa`** (reversão do #46). Login OK.
- **#48 mergeada** (item não contado = 0 no merge final: Excel de equipe + tela `CombinacaoClient.getMerged` + RPC). **Migration 019 APLICADA** no Supabase (a RPC `combine_session_results` itera o inventário inteiro; `COALESCE(NULLIF(bpu,0),1)` evita divisão por zero).
- **#49 aberta, NÃO mergeada** (ver acima).
- **#46 (dead code) continua aberta — NÃO RE-MERGEAR.** Apagava `proxy.ts` (= middleware de auth do Next 16, carregado por convenção) → loop no login em produção. Se for limpar dead code, EXCLUIR `proxy.ts` da limpeza.
- **#47 (solo PIN login) fechada/abandonada** (bounce 307, causa não achada). Não reabrir sem repensar.
- **Produção RESETADA**: só **admin** + **inventário** (`inventory_items` 402 + `item_bin_locations` 282). Sem contagens/equipes/sessões/solo.

## Lições que continuam valendo
- **NUNCA apagar `proxy.ts`.** É o middleware ativo (convenção Next 16, não é importado — grep de imports NÃO o detecta). Apagar = loop no login.
- **Não fazer refactor não-essencial perto de um evento crítico** (contagem real). Foco só no pedido.
- **Preview e produção usam o MESMO banco Supabase** — não há DB por branch.
- **Migration NÃO é auto-aplicada no merge** — aplicar à mão (Supabase MCP `apply_migration`).
- **Antes de mergear**, esperar o **preview do Vercel buildar** (valida TS/ESLint — foi o que faltou no #46) e o usuário testar.

## Pendências abertas (fora a #49)
- **Auditoria final (2 auditores)** — única tarefa antiga de produto ainda aberta.
- Limpar eventual sessão de teste antes de uso real.
- Ping diário p/ Supabase Free (evitar pausa 7 dias) — discutido, não implementado.

Ver também [[project-count-stock-snapshot-2026-07-01]] e [[feedback-reuse-components]].
