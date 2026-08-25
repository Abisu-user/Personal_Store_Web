-- Store the selected catalogue source explicitly, so Jikan and AniList IDs
-- can never collide and a fallback search result remains refreshable.

alter table public.anime_library
  drop constraint if exists anime_library_external_source_check;

alter table public.anime_library
  add constraint anime_library_external_source_check
  check (external_source in ('jikan', 'anilist'));
