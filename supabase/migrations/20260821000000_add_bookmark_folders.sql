-- Bookmark folders are separate from cross-content categories.
-- A bookmark can retain a category while also living in one user-owned folder.

create table if not exists public.bookmark_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.entries
  add column if not exists bookmark_folder_id uuid references public.bookmark_folders(id) on delete set null;

create index if not exists bookmark_folders_owner_sort_idx
  on public.bookmark_folders (owner_id, sort_order, name);
create index if not exists entries_owner_bookmark_folder_idx
  on public.entries (owner_id, bookmark_folder_id, updated_at desc)
  where kind = 'bookmark' and deleted_at is null;

alter table public.bookmark_folders enable row level security;

drop policy if exists "bookmark_folders_select_own" on public.bookmark_folders;
create policy "bookmark_folders_select_own" on public.bookmark_folders
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "bookmark_folders_insert_own" on public.bookmark_folders;
create policy "bookmark_folders_insert_own" on public.bookmark_folders
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "bookmark_folders_update_own" on public.bookmark_folders;
create policy "bookmark_folders_update_own" on public.bookmark_folders
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "bookmark_folders_delete_own" on public.bookmark_folders;
create policy "bookmark_folders_delete_own" on public.bookmark_folders
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop trigger if exists vault_app_bookmark_folders_updated_at on public.bookmark_folders;
create trigger vault_app_bookmark_folders_updated_at
before update on public.bookmark_folders
for each row execute procedure public.vault_app_set_updated_at();
