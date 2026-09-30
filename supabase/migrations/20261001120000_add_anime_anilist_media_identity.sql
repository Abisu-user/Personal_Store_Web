-- A library row keeps its original provider ID (including Bangumi/manual IDs).
-- This separate identity lets airing metadata use a stable AniList Media ID.
alter table public.anime_library
  add column if not exists anilist_media_id integer,
  add column if not exists anilist_match_checked_at timestamptz;

alter table public.anime_library
  drop constraint if exists anime_library_anilist_media_id_positive;
alter table public.anime_library
  add constraint anime_library_anilist_media_id_positive
  check (anilist_media_id is null or anilist_media_id > 0);

-- Direct AniList imports are unambiguous; preserve all other provider IDs.
update public.anime_library
set anilist_media_id = external_id::integer,
    anilist_match_checked_at = now()
where external_source = 'anilist'
  and external_id ~ '^[0-9]{1,10}$'
  and external_id::bigint between 1 and 2147483647
  and anilist_media_id is null;

create or replace function public.vault_app_anime_anilist_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.external_source = 'anilist'
    and new.external_id ~ '^[0-9]{1,10}$'
    and new.external_id::bigint between 1 and 2147483647 then
    new.anilist_media_id := new.external_id::integer;
    new.anilist_match_checked_at := now();
  elsif tg_op = 'UPDATE' then
    if (new.external_source, new.external_id) is distinct from (old.external_source, old.external_id) then
      new.anilist_media_id := null;
      new.anilist_match_checked_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vault_app_anime_anilist_identity on public.anime_library;
create trigger vault_app_anime_anilist_identity
before insert or update of external_source, external_id on public.anime_library
for each row execute function public.vault_app_anime_anilist_identity();
