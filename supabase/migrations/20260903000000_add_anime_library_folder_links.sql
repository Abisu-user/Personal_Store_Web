-- A work can be shown in more than one Anime Library folder.  Keep the
-- existing anime_library.folder_id as a backwards-compatible primary folder
-- while this link table is the authoritative multi-folder assignment.

create table if not exists public.anime_library_folders (
  anime_id uuid not null references public.anime_library(id) on delete cascade,
  folder_id uuid not null references public.anime_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (anime_id, folder_id)
);

-- Preserve every existing single-folder assignment when enabling multi-folder
-- support for an already populated library.
insert into public.anime_library_folders (anime_id, folder_id)
select id, folder_id
from public.anime_library
where folder_id is not null
on conflict (anime_id, folder_id) do nothing;

create index if not exists anime_library_folders_folder_idx
  on public.anime_library_folders (folder_id, anime_id);

alter table public.anime_library_folders enable row level security;
revoke all on table public.anime_library_folders from anon, authenticated;

drop policy if exists "anime library folders: anime owner" on public.anime_library_folders;
create policy "anime library folders: anime owner"
  on public.anime_library_folders
  for all to authenticated
  using (
    exists (
      select 1
      from public.anime_library anime
      where anime.id = anime_id
        and anime.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.anime_library anime
      where anime.id = anime_id
        and anime.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.anime_folders folder
      where folder.id = folder_id
        and folder.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
