---
name: project-count-stock-roadmap
description: "Roadmap pós-primeira contagem real (2026-07-08) — 10 itens priorizados P0-P4, ordem de execução já decidida pelo usuário"
metadata: 
  node_type: memory
  type: project
  updatedOn: 2026-08-05
  originSessionId: 056a9b5e-fbc9-447a-8b47-3d35b19762f7
---

# Roadmap pós-primeira contagem real — Count Stock

Origem: feedback do usuário após a primeira contagem tripla real em produção (2026-07-08). Resultado: contagem + reconciliação em **1 dia**, contra ~10h + 1 semana do processo manual anterior. `combine_session_results` funcionou como esperado.

## Ordem de execução (já decidida pelo usuário — não repreguntar)

1. **Item 1 — P0 — CONCLUÍDO 2026-07-21**: sessão não encerrava e o acesso não era revogado depois de "Confirm merged results". Migration `020_encerrar_sessao_combinacao.sql` (a RPC passa a setar `count_sessions.status='fechada'`, RLS bloqueia escrita depois disso) + guard de UI em `app/(counter)/layout.tsx`, via PR #54. Bug de follow-up achado pelo usuário em teste real (o guard nunca disparava — embed do PostgREST vinha como objeto, não array) corrigido no PR #57.

2. **Item 2 — P0 — PRÓXIMO DA FILA**: contagem por peso não permite "adicionar rodada" nem reconciliação por peso. Falta o branch `is_weight_count` no "+ Add to Count" e no formulário de reconciliação — o schema já suporta peso. Pode ser a mesma classe de bug do PR #51 (`entryOverrides`: estado client-side que não reflete o valor real salvo).

3. **Item 4 — P1**: filtro Ativo/Inativo na busca + confirmação ao selecionar item inativo + BIN na descrição do card. A coluna `brand_active` **já existe** (migration 021, veio junto com o PR #55) — falta só a camada visual. **ATENÇÃO**: `bin_location` está sempre NULL desde o PR #22 — investigar a tabela `item_bin_locations` antes de prometer BIN no card.

4. **Item 3 — P1**: novo fluxo de finalização — o independente decide diretamente sim/não sobre o fim da contagem, com ciclo de revisão bidirecional admin↔independente após a submissão. É a maior mudança de máquina de estados (`teams.status` / `count_sessions`) do roadmap; precisa de spec própria (brainstorming com diagrama de estados) antes de qualquer código.

5. **Itens 5 e 6 — P2**: independente ganha busca read-only do inventário (reusa `BuscaClient` sem `onSubmit`); padronizar o visual da tabela do independente com as do admin. Baixo custo, não precisam de spec.

6. **Itens 7, 8, 9 — P3**: cada um com spec própria antes de codar.
   - **Item 7 — CONCLUÍDO fora de ordem, 2026-07-31/08-05, via PR #58** (pedido urgente, adiantado na frente da fila). Implementação nova do zero: a conta fixa reusa o padrão 2-PIN do login normal, em vez do fluxo de PIN por cookie que causou o bounce 307 no PR #47. Foi além do escopo original — também entregou lista pré-selecionada de itens e e-mail de resultado ao admin. Detalhes técnicos em [[project-count-stock]].
   - **Item 8**: contagem via código de barras (até 3 por item). Maior item da lista; nenhuma lib de scan instalada hoje (candidatas: ZXing, QuaggaJS). Recomendado um spike de 1 dia validando câmera real antes de comprometer a implementação completa.
   - **Item 9**: auditoria — export de dados brutos + assinatura digital (canvas nativo) + fallback PDF. Nenhuma lib de PDF instalada (candidatas: pdf-lib, @react-pdf/renderer). A tabela `audit_approvals` já existe no schema mas nunca foi usada.

7. **Item 10 — P4**: padronização visual/UX contínua, fatiada por tela. É onde entra o **plano de rebrand em 4 PRs**, aprovado em conceito em 2026-07-21 e ainda não iniciado:
   - **(A) infra** — migrar os tokens `--cs-*` de CSS vars soltas para o `@theme` do Tailwind 4 (hoje cada uso exige `style={{background:'var(--cs-x)'}}` inline, e é por isso que a adoção nunca pegou) + componentes compartilhados (`<AppHeader>` único para admin e counter, hoje duplicado)
   - **(B)** aplicar em todo o `app/admin/**` restante
   - **(C)** aplicar em todo o `app/(counter)/**` — maior risco, é o que roda ao vivo durante a contagem física
   - **(D)** seção "Design System" no `CLAUDE.md` proibindo cor Tailwind hardcoded daqui pra frente + verificar se `app/(admin)/*` é rota morta duplicada (candidata a deletar)
   - Contexto: o PR #53 fez o rebrand e foi mergeado sem autorização em 2026-07-06, revertido no mesmo dia. O PR #56 recria aquele estado sobre a main atual **só como base de review — não mergear**. O achado do review: o rebrand cobre 6 de ~40 arquivos, o que colide direto com [[feedback-reuse-components]] (o usuário não aceita divergência visual).

## Notas de arquitetura citadas no roadmap
- `bin_location` sempre NULL desde o PR #22 — não prometer BIN na busca sem investigar `item_bin_locations` antes.
- Nenhuma lib de barcode scan ou de geração de PDF instalada — itens 8 e 9 exigem dependência nova.
- PR #47 (solo PIN) foi abandonado por bug de redirect — não reaproveitar aquele código.
- Mudanças de RLS ou de status de sessão (itens 2 e 3): **preview e produção compartilham o mesmo banco Supabase**, cuidado ao testar.

Ver [[project-count-stock]] para stack, PRs e estado atual, e [[project-count-stock-architecture]] para os padrões técnicos e armadilhas.
