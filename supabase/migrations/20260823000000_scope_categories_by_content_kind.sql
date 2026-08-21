-- Categories belong to one content type. Existing categories originated from
-- bookmarks, so keep them in the bookmark scope during the transition.
alter table public.categories
  add column if not exists content_kind public.entry_kind;

update public.categories
set content_kind = 'bookmark'
where content_kind is null;

alter table public.categories
  alter column content_kind set not null;

alter table public.categories
  drop constraint if exists categories_owner_id_name_key;

alter table public.categories
  add constraint categories_owner_content_kind_name_key
  unique (owner_id, content_kind, name);

create index if not exists categories_owner_content_kind_sort_idx
  on public.categories (owner_id, content_kind, sort_order, name);
