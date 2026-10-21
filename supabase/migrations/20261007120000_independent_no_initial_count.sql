-- Regressão vinda da PR #63 no fluxo legado de equipes: o Independente monitora
-- e concilia, mas nunca grava contagem inicial (count_entries), nem por chamada
-- direta à Data API. Papel lido do vínculo protegido (my_counter_role), nunca de
-- user_metadata. SELECT inalterado para o monitor; demais guardas mantidas.
-- Em produção o Independente nunca gravou count_entries (consulta de 2026-10-07).
drop policy if exists independent_no_initial_insert on public.count_entries;
drop policy if exists independent_no_initial_update on public.count_entries;
drop policy if exists independent_no_initial_delete on public.count_entries;

create policy independent_no_initial_insert on public.count_entries
  as restrictive for insert to authenticated
  with check ((select public.is_admin()) or (select public.my_counter_role()) in ('contador_1', 'contador_2'));
create policy independent_no_initial_update on public.count_entries
  as restrictive for update to authenticated
  using ((select public.is_admin()) or (select public.my_counter_role()) in ('contador_1', 'contador_2'))
  with check ((select public.is_admin()) or (select public.my_counter_role()) in ('contador_1', 'contador_2'));
create policy independent_no_initial_delete on public.count_entries
  as restrictive for delete to authenticated
  using ((select public.is_admin()) or (select public.my_counter_role()) in ('contador_1', 'contador_2'));
