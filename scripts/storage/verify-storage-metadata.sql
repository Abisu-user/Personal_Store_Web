-- Read-only verification for Phase 2. Expected result: all checks are true and
-- metadata_rows is 0 immediately after the additive migration.
select
  to_regclass('public.storage_objects') is not null as storage_objects_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'file_details' and column_name = 'storage_object_id'
  ) as file_reference_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'cover_storage_object_id'
  ) as entry_cover_reference_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anime_library' and column_name = 'cover_storage_object_id'
  ) as anime_cover_reference_exists,
  (select count(*) from public.storage_objects) as metadata_rows,
  (select count(*) from public.file_details where storage_object_id is not null) as linked_files,
  (select count(*) from public.entries where cover_storage_object_id is not null) as linked_entry_covers,
  (select count(*) from public.anime_library where cover_storage_object_id is not null) as linked_anime_covers;

