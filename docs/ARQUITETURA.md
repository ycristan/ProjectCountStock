# Arquitetura — Count Stock

## Componentes
- **Next.js 16 + React 19 + TypeScript + Tailwind 4:** interface e Server Actions.
- **Supabase** (projeto `sktpzvlmeegyuqsvtunx`): Auth, Postgres, RLS e Realtime.
- **Vercel** (`project-count-stock-ylmm`): produção a partir da `main` e previews por branch.
- **SheetJS 0.20.3** (distribuição oficial, não o npm 0.18.5): importação/exportação XLSX e ZIP por warehouse.
- **Sentry:** erros de navegador e servidor, sem PINs ou dados pessoais.
- **EmailJS:** envio do resultado de sessão solo (`lib/send-solo-results-email.ts`).

## Áreas do código
- `app/admin/`: telas administrativas (a rota usada é `/admin/sessao`; `app/(admin)/` também existe, confirmar qual arquivo serve a rota antes de editar).
- `app/(counter)/`: telas da equipe (busca, finalizar, monitor, reconciliacao). `app/solo/`: contador solo.
- `actions/`: Server Actions; toda mutação valida o chamador.
- `lib/supabase-client.ts` → `createClient()` no navegador (NÃO existe `createBrowserClient`; errar o nome quebra o build).
- `lib/supabase-server.ts` → `createClient()` no servidor. `lib/supabase-admin.ts` → `createAdminClient()` (service_role, só após autorização).
- `lib/authorization.ts`: leitura de papéis protegidos (`app_user_access`). `lib/fetch-all-rows.ts`: paginação.
- `supabase/migrations/`: schema, funções e RLS. `supabase/maintenance/`: scripts operacionais revisados, nunca aplicados automaticamente.

## Dados principais
- `warehouses`; `inventory_items` (Brand Code globalmente único, `warehouse_id`, `brand_active`); `item_bin_locations`.
- Legado de equipes: `count_sessions`, `teams`, `counter_accounts`, `count_entries`, `reconciliation_items`, `combined_results`.
- Solo: `solo_sessions`, `solo_entries`, `solo_session_items`. Configuração: `app_settings`. Autorização: `app_user_access`.
- `inventory_items` nunca tem linhas apagadas: é FK de contagens, reconciliações, resultados e BINs.

## Fórmulas
- **Normal:** `final_cases = pallets × pallet_size + cases`; `final_units = units`. Conversão canônica em `lib/convert.ts` / `convert_count` no banco.
- **Peso:** `liquido = peso_bruto_g − num_caixas × tara_g`; `unidades = liquido / weight_avg`, parte decimal ≥ 0,7 arredonda para cima, senão para baixo; depois normaliza por BPU. Várias rodadas de pesagem somam. Campo de gramas inteiros com máscara de milhar.
- **Combinação legada:** soma entre equipes em unidades, renormalizada pelo BPU; ativo não contado entra como zero (não vale para solo).

## Armadilhas que já custaram produção
1. **`proxy.ts` na raiz** é o middleware de auth do Next 16, carregado por convenção e invisível em buscas de import. Apagá-lo causou loop de login em produção. Nunca remover em limpezas.
2. **PostgREST corta em 1000 linhas** mesmo com `.range()`. Em `inventory_items`, `item_bin_locations`, `count_entries`, `reconciliation_items`, `solo_entries` e similares, usar sempre `fetchAllRows()`. O parâmetro aceita `PromiseLike`, não `Promise`.
3. **Realtime precisa de `supabase.realtime.setAuth(token)` antes do `subscribe()`**; sem isso conecta como anônimo e a RLS bloqueia todos os eventos. Realtime não é a única fonte de estado: recarregar após reconexão.
4. **Embed de FK única volta como objeto, não array** (`team.count_sessions`, não `[0]`). Ler como array deixou o bloqueio de sessão fechada sem efeito.
5. **Estado no cliente para soma incremental guarda o valor salvo**, não um flag de "já contado" (bug do "+ Add to Count" que sobrescrevia em vez de somar).
6. **Preview e produção compartilham o banco.** Não existe banco por branch.
7. **Variável de ambiente na Vercel precisa dos escopos Production e Preview.** Variável marcada como sensitive não permite editar o escopo depois.
8. **Migration não é aplicada pelo merge.** O conector Supabase grava a versão com a data de aplicação, então os números remotos diferem dos arquivos: comparar nome e SQL, nunca reaplicar só pela diferença de timestamp.
9. **`next build` falha com variável não usada** (ESLint).
10. **Login solo por cookie/PIN foi abandonado** (redirect 307 sem causa encontrada). O solo usa conta fixa com login 2-PIN; não reabrir o caminho do cookie.
11. **Warehouse nova ≠ renomear warehouse.** Upload com nome diferente criava outra identidade e deixava os produtos ausentes para trás (incidente de 2026-09-24). Hoje a criação de WHS nova é rejeitada se a planilha tiver Brand Code já cadastrado.

## Novo fluxo de equipes — modelo técnico (branch da PR #74, não está na main)
- `team_flows` marca equipes do novo fluxo; ausência = legado, sem conversão implícita.
- `team_memberships` separa identidade Auth de participação/papel (uma pessoa pode estar em várias equipes). `team_count_slots` e `team_slot_assignments` guardam posição lógica e autoria em substituições. Sem colunas `contador_3`, `contador_4`.
- `team_count_records` guarda componentes físicos, BPU e método usados; total canônico calculado pelo banco.
- `team_result_versions` / `team_result_items`: versões seladas por revisão, imutáveis.
- Comandos via funções no schema `private`, com wrappers públicos invoker. Autoria vem de `auth.uid()` e do vínculo protegido. Nenhuma escrita direta nas tabelas. Retry idempotente por UUID de comando.
