-- A category belongs to one content type and one folder scope.  `NULL` means
-- the built-in "未整理" scope, so existing data remains visible and no entry is
-- reassigned during the migration.
alter table public.categories
  add column if not exists folder_id uuid;

alter table public.categories
  drop constraint if exists categories_owner_content_kind_name_key;

create unique index if not exists categories_owner_kind_unorganized_name_key
  on public.categories (owner_id, content_kind, name)
  where folder_id is null;

create unique index if not exists categories_owner_kind_folder_name_key
  on public.categories (owner_id, content_kind, folder_id, name)
  where folder_id is not null;

create index if not exists categories_owner_kind_folder_sort_idx
  on public.categories (owner_id, content_kind, folder_id, sort_order, name);

-- Existing labels were previously shared by every folder.  They deliberately
-- stay in the unorganized scope rather than being copied into all folders.
-- Moving an item to a new folder clears an out-of-scope category in the API.

notify pgrst, 'reload schema';
