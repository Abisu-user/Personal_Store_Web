-- Add Bangumi as a third, independent public metadata source. Existing rows
-- and identifiers are preserved; only the source constraint is widened.

alter table public.anime_library
  drop constraint if exists anime_library_external_source_check;

alter table public.anime_library
  add constraint anime_library_external_source_check
  check (external_source in ('jikan', 'anilist', 'bangumi'));
