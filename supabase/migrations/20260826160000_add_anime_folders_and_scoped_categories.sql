-- Anime folders are independent for normal and adult libraries.  Existing
-- anime and categories stay in the unorganised (`folder_id is null`) scope.

create table if not exists public.anime_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null default 'standard' check (scope in ('standard', 'adult')),
  name citext not null check (char_length(btrim(name::text)) between 1 and 80),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, name)
);

alter table public.anime_library
  add column if not exists folder_id uuid references public.anime_folders(id) on delete set null;

alter table public.anime_tags
  add column if not exists folder_id uuid references public.anime_folders(id) on delete cascade;

alter table public.anime_tags
  drop constraint if exists anime_tags_user_scope_name_key;

create unique index if not exists anime_tags_unorganised_name_key
  on public.anime_tags (user_id, scope, name)
  where folder_id is null;

create unique index if not exists anime_tags_folder_name_key
  on public.anime_tags (user_id, scope, folder_id, name)
  where folder_id is not null;

create index if not exists anime_folders_user_scope_sort_idx
  on public.anime_folders (user_id, scope, sort_order, created_at);
create index if not exists anime_library_folder_idx
  on public.anime_library (user_id, folder_id, updated_at desc)
  where deleted_at is null;
create index if not exists anime_tags_scope_folder_idx
  on public.anime_tags (user_id, scope, folder_id, name);

create trigger vault_app_anime_folders_updated_at
before update on public.anime_folders
for each row execute procedure public.vault_app_set_updated_at();

alter table public.anime_folders enable row level security;
revoke all on table public.anime_folders from anon, authenticated;
grant select, insert, update, delete on table public.anime_folders to authenticated;

create policy "anime folders: owner" on public.anime_folders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
