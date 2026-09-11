-- Additive multi-folder/category support for entry-backed features.
-- Legacy entries.*_id columns remain as backwards-compatible primary links.

create table if not exists public.entry_category_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, category_id)
);

create table if not exists public.entry_content_folder_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  folder_id uuid not null references public.content_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, folder_id)
);

create table if not exists public.bookmark_entry_folders (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  folder_id uuid not null references public.bookmark_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, folder_id)
);

insert into public.entry_category_links (owner_id, entry_id, category_id)
select owner_id, id, category_id from public.entries where category_id is not null
on conflict (entry_id, category_id) do nothing;

insert into public.entry_content_folder_links (owner_id, entry_id, folder_id)
select owner_id, id, content_folder_id from public.entries where content_folder_id is not null
on conflict (entry_id, folder_id) do nothing;

insert into public.bookmark_entry_folders (owner_id, entry_id, folder_id)
select owner_id, id, bookmark_folder_id from public.entries where bookmark_folder_id is not null
on conflict (entry_id, folder_id) do nothing;

create index if not exists entry_category_links_owner_category_idx on public.entry_category_links (owner_id, category_id, entry_id);
create index if not exists entry_content_folder_links_owner_folder_idx on public.entry_content_folder_links (owner_id, folder_id, entry_id);
create index if not exists bookmark_entry_folders_owner_folder_idx on public.bookmark_entry_folders (owner_id, folder_id, entry_id);

alter table public.entry_category_links enable row level security;
alter table public.entry_content_folder_links enable row level security;
alter table public.bookmark_entry_folders enable row level security;

revoke all on public.entry_category_links, public.entry_content_folder_links, public.bookmark_entry_folders from anon;
grant select, insert, update, delete on public.entry_category_links, public.entry_content_folder_links, public.bookmark_entry_folders to authenticated;

drop policy if exists "entry category links: owner" on public.entry_category_links;
create policy "entry category links: owner" on public.entry_category_links for all to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.entries e where e.id = entry_category_links.entry_id and e.owner_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (
  select 1 from public.entries e join public.categories c on c.id = entry_category_links.category_id
  where e.id = entry_category_links.entry_id and e.owner_id = (select auth.uid()) and c.owner_id = (select auth.uid()) and c.content_kind = e.kind
));

drop policy if exists "entry content folder links: owner" on public.entry_content_folder_links;
create policy "entry content folder links: owner" on public.entry_content_folder_links for all to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.entries e where e.id = entry_content_folder_links.entry_id and e.owner_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (
  select 1 from public.entries e join public.content_folders f on f.id = entry_content_folder_links.folder_id
  where e.id = entry_content_folder_links.entry_id and e.owner_id = (select auth.uid()) and f.owner_id = (select auth.uid()) and f.content_kind = e.kind
));

drop policy if exists "bookmark entry folders: owner" on public.bookmark_entry_folders;
create policy "bookmark entry folders: owner" on public.bookmark_entry_folders for all to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.entries e where e.id = bookmark_entry_folders.entry_id and e.owner_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (
  select 1 from public.entries e join public.bookmark_folders f on f.id = bookmark_entry_folders.folder_id
  where e.id = bookmark_entry_folders.entry_id and e.owner_id = (select auth.uid()) and e.kind = 'bookmark' and f.owner_id = (select auth.uid())
));

notify pgrst, 'reload schema';
