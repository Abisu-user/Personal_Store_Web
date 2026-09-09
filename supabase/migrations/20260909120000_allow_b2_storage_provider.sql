-- Phase 4 prerequisite: allow new Backblaze B2 metadata rows.
-- This changes only the provider validation constraint. It does not insert,
-- update, move, or delete any existing metadata or Storage object.

begin;

alter table public.storage_objects
  drop constraint if exists storage_objects_provider_check;

alter table public.storage_objects
  add constraint storage_objects_provider_check
  check (provider in ('supabase', 'r2', 'b2'))
  not valid;

alter table public.storage_objects
  validate constraint storage_objects_provider_check;

comment on column public.storage_objects.provider is
  'Storage backend identifier. Supported transitional providers: supabase, r2, and b2.';

commit;
