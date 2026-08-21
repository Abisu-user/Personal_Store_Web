-- Private photo entries reuse the existing private vault-files bucket and file_details table.
alter table public.content_folders
  drop constraint if exists content_folders_content_kind_check;

alter table public.content_folders
  add constraint content_folders_content_kind_check
  check (content_kind in ('note', 'code', 'file', 'photo'));

create index if not exists entries_owner_photo_idx
  on public.entries (owner_id, updated_at desc)
  where kind = 'photo' and deleted_at is null;
