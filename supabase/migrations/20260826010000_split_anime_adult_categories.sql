-- Adult Anime categories must be independent from standard Anime categories.
-- Existing adult links are copied to the new adult scope before their links are
-- redirected, preserving both existing libraries and their category names.

alter table public.anime_tags
  add column if not exists scope text not null default 'standard';

alter table public.anime_tags
  drop constraint if exists anime_tags_scope_check;

alter table public.anime_tags
  add constraint anime_tags_scope_check
  check (scope in ('standard', 'adult'));

alter table public.anime_tags
  drop constraint if exists anime_tags_user_id_name_key;

alter table public.anime_tags
  drop constraint if exists anime_tags_user_scope_name_key;

alter table public.anime_tags
  add constraint anime_tags_user_scope_name_key unique (user_id, scope, name);

insert into public.anime_tags (user_id, name, color, scope)
select distinct tag.user_id, tag.name, tag.color, 'adult'
from public.anime_library_tags link
join public.anime_library anime on anime.id = link.anime_id
join public.anime_tags tag on tag.id = link.tag_id
where anime.is_adult
on conflict (user_id, scope, name) do update
set color = excluded.color;

update public.anime_library_tags link
set tag_id = adult_tag.id
from public.anime_library anime,
     public.anime_tags standard_tag,
     public.anime_tags adult_tag
where link.anime_id = anime.id
  and standard_tag.id = link.tag_id
  and adult_tag.user_id = standard_tag.user_id
  and adult_tag.name = standard_tag.name
  and adult_tag.scope = 'adult'
  and anime.is_adult
  and standard_tag.scope = 'standard';

create index if not exists anime_tags_user_scope_name_idx
  on public.anime_tags (user_id, scope, name);

notify pgrst, 'reload schema';
