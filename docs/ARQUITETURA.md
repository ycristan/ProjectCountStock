# Arquitetura — Count Stock

## Componentes
- **Next.js 16 + React + TypeScript:** interface e Server Actions.
- **Supabase:** autenticação, Postgres, RLS e Realtime.
- **Vercel:** deploy de preview e produção.
- **XLSX:** importação/exportação de inventário.
- **EmailJS:** envio do resultado de sessão solo.

## Áreas principais do código
- `app/admin/`: telas administrativas.
- `app/(counter)/`: telas da equipe de contagem.
- `app/solo/`: fluxo do contador solo.
- `actions/`: regras do servidor; qualquer mutação deve validar o chamador.
- `lib/supabase-server.ts`: cliente Supabase de servidor.
- `lib/supabase-admin.ts`: cliente com privilégio máximo; uso restrito após validação de autorização.
- `supabase/migrations/`: schema, funções e políticas RLS, sempre versionados.

## Dados principais
- `count_sessions`, `teams`, `counter_accounts`
- `inventory_items`, `item_bin_locations`
- `count_entries`, `reconciliation_items`, `combined_results`
- `solo_sessions`, `solo_entries`, `solo_session_items`
- `app_settings`

## Limites e cuidados
- Produção e preview usam o mesmo projeto Supabase. Mudanças de banco e RLS exigem cautela extra.
- O PostgREST limita consultas; para tabelas potencialmente grandes, usar `fetchAllRows` com paginação.
- Realtime precisa autenticar o token antes de assinar eventos.
- `proxy.ts` é parte essencial do controle de sessão e não deve ser removido numa limpeza de código.
- Autorização não pode depender de `user_metadata`, pois esse dado é editável pelo usuário. Ver prioridade de segurança no estado atual.
