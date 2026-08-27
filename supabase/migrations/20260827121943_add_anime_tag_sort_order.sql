-- Keep Anime Library categories in a deliberate per-folder order, matching
-- the shared note/code/file/photo category manager.  Existing tags are
-- assigned a stable order without deleting or reclassifying any user data.
alter table public.anime_tags
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, scope, folder_id
      order by created_at, name, id
    ) - 1 as next_sort_order
  from public.anime_tags
)
update public.anime_tags as tag
set sort_order = ranked.next_sort_order
from ranked
where ranked.id = tag.id;

create index if not exists anime_tags_scope_folder_sort_idx
  on public.anime_tags (user_id, scope, folder_id, sort_order, created_at);
