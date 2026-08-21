-- Shared organization and cover-image metadata for notes, code snippets, and files.
create table if not exists public.content_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content_kind public.entry_kind not null check (content_kind in ('note', 'code', 'file')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, content_kind, name)
);

alter table public.entries
  add column if not exists content_folder_id uuid references public.content_folders(id) on delete set null,
  add column if not exists cover_image_path text;

create index if not exists content_folders_owner_kind_sort_idx
  on public.content_folders (owner_id, content_kind, sort_order, name);

create index if not exists entries_owner_content_folder_idx
  on public.entries (owner_id, kind, content_folder_id, updated_at desc)
  where deleted_at is null;

alter table public.content_folders enable row level security;

create policy "content folders: owner only" on public.content_folders
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop trigger if exists vault_app_content_folders_updated_at on public.content_folders;
create trigger vault_app_content_folders_updated_at
before update on public.content_folders
for each row execute procedure public.vault_app_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-covers', 'content-covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
