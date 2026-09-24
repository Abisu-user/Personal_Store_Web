-- Track provider matching independently of anime_library.updated_at so a
-- background check never changes the user's collection ordering or metadata.
create table if not exists public.anime_watch_source_matches (
  anime_id uuid primary key references public.anime_library(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('unknown', 'matching', 'matched', 'not_found', 'ambiguous', 'error')),
  match_version integer not null default 0 check (match_version >= 0),
  checked_at timestamptz
);

create index if not exists anime_watch_source_matches_user_status_idx
  on public.anime_watch_source_matches (user_id, status, anime_id);

alter table public.anime_watch_source_matches enable row level security;
revoke all on table public.anime_watch_source_matches from anon, authenticated;

create policy "anime watch source matches: owner"
  on public.anime_watch_source_matches for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.anime_library anime where anime.id = anime_id and anime.user_id = user_id)
  )
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.anime_library anime where anime.id = anime_id and anime.user_id = user_id)
  );

-- Existing NULL URLs cannot distinguish never checked from not found. Treat
-- them as unknown once; do not infer not_found or alter any collection row.
insert into public.anime_watch_source_matches
  (anime_id, user_id, status, match_version, checked_at)
select anime.id, anime.user_id,
  case when (
    (coalesce(anime.is_adult, false) = false and anime.source_url is not null)
    or
    (coalesce(anime.is_adult, false) = true and (
      anime.source_url ~* '^https://(www\.)?hanime1\.me(/|\?|$)'
      or anime.external_url ~* '^https://(www\.)?hanime1\.me(/|\?|$)'
    ))
  ) then 'matched' else 'unknown' end,
  0, null
from public.anime_library anime
where anime.deleted_at is null
  and anime.external_source in ('anilist', 'jikan', 'bangumi')
on conflict (anime_id) do nothing;

-- New automatic imports join the same queue without a second create path.
create or replace function public.vault_app_queue_anime_watch_source_match()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.external_source in ('anilist', 'jikan', 'bangumi') then
    insert into public.anime_watch_source_matches (anime_id, user_id, status)
    values (
      new.id,
      new.user_id,
      case when (
        (coalesce(new.is_adult, false) = false and new.source_url is not null)
        or
        (coalesce(new.is_adult, false) = true and (
          new.source_url ~* '^https://(www\.)?hanime1\.me(/|\?|$)'
          or new.external_url ~* '^https://(www\.)?hanime1\.me(/|\?|$)'
        ))
      ) then 'matched' else 'unknown' end
    )
    on conflict (anime_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists vault_app_anime_watch_source_match_queue on public.anime_library;
create trigger vault_app_anime_watch_source_match_queue
  after insert on public.anime_library
  for each row execute function public.vault_app_queue_anime_watch_source_match();
