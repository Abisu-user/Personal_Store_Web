-- Anime Library is now a personal, user-managed collection.  Preserve all
-- existing imported rows and legacy streaming fields; only add the generic
-- HTTPS link used by new manual entries and permit `manual` as a source.

alter table public.anime_library
  add column if not exists source_url text;

alter table public.anime_library
  drop constraint if exists anime_library_external_source_check;

alter table public.anime_library
  add constraint anime_library_external_source_check
  check (external_source in ('jikan', 'anilist', 'bangumi', 'manual'));

-- Keep any user-entered legacy viewing link useful after the UI changes.
update public.anime_library
set source_url = bahamut_url
where source_url is null
  and bahamut_url is not null;
