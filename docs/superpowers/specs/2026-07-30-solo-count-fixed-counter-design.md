# Solo Count — Contador Fixo, Lista Pré-Selecionada e E-mail de Resultado

Prioridade urgente (adiantada na frente do roadmap). Origem: pedido direto do usuário 2026-07-30.

## Objetivo

Hoje o Solo Count só pode ser contado pelo próprio admin (`actions/solo.ts`, `role==='admin'` obrigatório). Este spec adiciona um segundo modo: uma conta de contador fixa e compartilhada, que o admin pode atribuir a uma sessão solo específica, opcionalmente restrita a uma lista de itens pré-selecionada, com o resultado enviado por e-mail ao admin quando o contador finaliza.

## Fora de escopo

- Múltiplas contas de contador solo (confirmado: só 1 conta fixa, compartilhada por pessoas diferentes que digitam o próprio nome).
- Upload/colar lista em lote — a lista é montada só via busca+adicionar.
- Retry/fila de e-mail — falha de envio não bloqueia o fechamento da sessão.
- Qualquer mudança no fluxo de contagem em equipe (tripla) ou no Solo Count admin-only existente — ambos continuam exatamente como estão quando `assigned_to_counter=false`.

## Modelo de dados

### Migration `022_solo_counter_fixed.sql`

```sql
ALTER TABLE solo_sessions
  ADD COLUMN assigned_to_counter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN restrict_to_list BOOLEAN NOT NULL DEFAULT false;
-- counter_name já existe (migration 018, hoje sempre NULL) — reaproveitado:
-- passa a ser preenchido pelo PRÓPRIO contador na primeira vez que abre a sessão,
-- não mais pelo admin no momento da criação.

CREATE TABLE solo_session_items (
  session_id UUID NOT NULL REFERENCES solo_sessions(id) ON DELETE CASCADE,
  brand_code TEXT NOT NULL REFERENCES inventory_items(brand_code),
  PRIMARY KEY (session_id, brand_code)
);

CREATE TABLE app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- garante linha única
  notify_email TEXT
);
INSERT INTO app_settings (id, notify_email) VALUES (true, NULL);
```

RLS:
- `solo_session_items`: mesma política admin-only de `solo_sessions` (`FOR ALL USING role='admin'`) **mais** `SELECT` para o papel `counter` quando `is_solo_counter=true` e a `session_id` pertence a uma sessão com `assigned_to_counter=true`.
- `solo_sessions` / `solo_entries`: adicionar política para esse mesmo papel — `SELECT`/`UPDATE` em sessões `WHERE assigned_to_counter=true`, `INSERT`/`UPSERT` em `solo_entries` dessas sessões. Não pode ver/tocar sessões `assigned_to_counter=false` (as do admin).
- `app_settings`: `SELECT`/`UPDATE` admin-only.

### Conta fixa do contador solo

Criada manualmente via SQL direto em `auth.users`/`auth.identities` (mesmo processo usado para o 2º admin — não há tool MCP para `auth.admin.createUser`), com:
- `email`: `${team_pin}${user_pin}@count.local` (mesmo padrão dos contadores de equipe)
- `user_metadata`: `{"role": "counter", "is_solo_counter": true}`
- PINs fixos: fornecidos pelo usuário no momento da implementação, ou gerados (4+4 dígitos) — a decidir nessa hora, não bloqueia o design.

## Login e rotas do contador

- Login pela tela normal existente (`/login`) — mesmas credenciais 2-PIN, sem tela nova.
- `proxy.ts`: após autenticar, se `user_metadata.is_solo_counter === true` → redireciona para `/solo` (em vez de `/busca`, que é onde vai um contador de equipe comum).
- **`/solo`** (nova, papel counter): lista sessões `WHERE assigned_to_counter=true AND status='open'`, ordenadas por criação.
- **`/solo/[id]`** (nova, papel counter):
  1. Se `counter_name IS NULL`: mostra prompt simples "Digite seu nome" → salva em `solo_sessions.counter_name` via nova action → segue pro passo 2.
  2. Tela de contagem, reaproveitando `CountForm` + componente de busca já usados no Solo Count admin:
     - `restrict_to_list=true` → busca filtrada aos `brand_code` presentes em `solo_session_items` dessa sessão.
     - `restrict_to_list=false` → busca livre no inventário inteiro (igual ao Solo Count admin hoje).
  3. Botão "Finalizar" → nova action `finalizarSoloContagemCounter(sessionId)`: valida que a sessão pertence a esse papel e está `assigned_to_counter=true`, seta `status='closed'`, dispara e-mail (ver seção seguinte).

Nova action em `actions/solo.ts`: `lancarSoloContagemCounter` — mesmo contrato de `lancarSoloContagem`, mas checando papel `counter`+`is_solo_counter` (em vez de `admin`) e que a sessão alvo tem `assigned_to_counter=true`.

## Lado admin — montar lista e atribuir

Em `/admin/solo/[id]`, antes de qualquer contagem existir:
- Toggle "Quem conta: Eu mesmo / Contador solo" → seta `assigned_to_counter`.
- Se "Contador solo": toggle "Lista livre / Lista fechada" → seta `restrict_to_list`, mais um bloco de busca+adicionar (reaproveita o componente de busca existente, sem os campos de Pallets/Cases/Units — só adiciona/remove `brand_code` em `solo_session_items`).
- Campo "E-mail de notificação" (lê/grava `app_settings.notify_email`) — fica nessa mesma tela, sem página de settings dedicada.

Comportamento por estado de `assigned_to_counter`:
- `false` (padrão): tela do admin é exatamente a de hoje (`SoloCountClient`, admin conta direto). Nenhuma mudança visível.
- `true`: tela do admin vira monitor ao vivo (Realtime, mesmo padrão do monitor de equipe) — mostra `counter_name` assim que preenchido e os itens já lançados. Admin não conta mais diretamente nessa sessão.

## E-mail ao finalizar (Resend)

- Dependência nova: pacote `resend` + env var `RESEND_API_KEY` (Vercel).
- Dispara **só** dentro de `finalizarSoloContagemCounter` (nunca quando o admin finaliza uma sessão que conduziu ele mesmo — aí o fluxo continua sendo exportar Excel manualmente, sem mudança).
- Corpo: tabela HTML, colunas `Brand Name | Brand Code | Count Qty (Outers) | Count Qty (Units) | Status` (na mesma ordem/formato de `VMReconStockWH.xls`, com Brand Name acrescentada antes de tudo; `Status` sempre `"Avl"`).
- Linhas: só itens efetivamente contados (`solo_entries` da sessão). Itens da lista pré-selecionada que ficaram sem contar **não entram** no e-mail (confirmado com o usuário).
- Mapeamento `final_cases`→`Count Qty (Outers)`, `final_units`→`Count Qty (Units)` — mesma semântica já usada no export `/api/solo/[id]/export`.
- Destinatário: `app_settings.notify_email`. Se vazio, pula o envio e loga aviso no servidor — **não bloqueia** o fechamento da sessão.
- Falha no envio (API do Resend fora, etc.): sessão já fechou no banco antes da tentativa de envio; erro só é logado. Sem retry — volume baixo, um único destinatário, dá pra reexportar manualmente pelo admin se precisar.

## Testes/verificação mínima (fecha o ciclo, não é suíte completa)

- RLS: confirmar que o papel `counter`/`is_solo_counter` não enxerga sessões `assigned_to_counter=false` nem `solo_entries`/`solo_session_items` de outras sessões.
- Fluxo restrito: busca não retorna itens fora de `solo_session_items` quando `restrict_to_list=true`.
- Fluxo livre: busca retorna inventário inteiro quando `restrict_to_list=false`.
- E-mail: sessão finalizada pelo contador com `notify_email` vazio fecha normalmente sem erro; com `notify_email` preenchido, chega e-mail com a tabela correta (itens contados, sem os pendentes da lista).
- Admin finalizando sessão própria (`assigned_to_counter=false`) nunca dispara e-mail.

## Workflow de implementação

- Branch `feat/...`, nunca direto na `main` (ver `feedback_branch_before_changes`).
- Código gerado com `/ponytail` (modo full, já ativo) e revisado com `/ponytail-review` antes do PR.
- PR aberto ao final; merge só com autorização explícita nessa hora (ver `feedback_merge_via_git` — já houve 2 incidentes de merge sem pedir).
- Migration aplicada manualmente via Supabase MCP depois do merge (não é automática).
