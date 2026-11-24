-- Title of a team count session (Yuri, 24/11), e.g. "End Of Year Count CCH - Main Warehouse 2026".
-- Required for NEW sessions by the create-session action; the column stays optional so every
-- existing session (and every fixture that inserts a session directly) keeps working unchanged.
-- Additive only: no existing row or column is changed.
alter table public.count_sessions add column title text;
alter table public.count_sessions add constraint count_sessions_title_valid
  check (title is null or (btrim(title) <> '' and char_length(title) <= 120));
