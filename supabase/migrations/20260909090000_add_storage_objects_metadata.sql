-- Phase 2: provider-neutral Storage metadata.
-- This migration is additive only. It does not backfill, move, rewrite, or delete
-- any existing object or legacy storage_path / cover path reference.

create table if not exists public.storage_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('supabase', 'r2')),
  bucket text not null check (char_length(bucket) between 1 and 255),
  object_key text not null check (char_length(object_key) between 1 and 2048),
  category text not null check (char_length(category) between 1 and 100),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  mime_type text check (mime_type is null or char_length(mime_type) between 1 and 255),
  checksum text check (checksum is null or char_length(checksum) between 1 and 512),
  status text not null default 'pending' check (status in ('pending', 'active', 'deleting', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, bucket, object_key)
);

comment on table public.storage_objects is
  'Provider-neutral metadata. Existing storage_path and cover references remain supported during transition.';
comment on column public.storage_objects.user_id is
  'Owner derived from the authenticated Supabase session by server-only code.';
comment on column public.storage_objects.object_key is
  'Provider object key only; never a public URL or secret-bearing signed URL.';
comment on column public.storage_objects.checksum is
  'Optional provider-neutral checksum. Existing SHA-256 values may be stored as lowercase hexadecimal.';
comment on column public.storage_objects.deleted_at is
  'Soft lifecycle marker. Rows and provider objects are not automatically deleted by this field.';

create index if not exists storage_objects_user_status_idx
  on public.storage_objects (user_id, status, updated_at desc);
create index if not exists storage_objects_user_category_idx
  on public.storage_objects (user_id, category, created_at desc);
create index if not exists storage_objects_pending_idx
  on public.storage_objects (created_at)
  where status = 'pending';

drop trigger if exists vault_app_storage_objects_updated_at on public.storage_objects;
create trigger vault_app_storage_objects_updated_at
before update on public.storage_objects
for each row execute procedure public.vault_app_set_updated_at();

alter table public.storage_objects enable row level security;
revoke all on public.storage_objects from anon, authenticated;
grant select, insert, update, delete on public.storage_objects to service_role;

-- Transitional nullable references. Legacy columns remain required/readable and
-- no existing row is changed. New code may dual-write these IDs after deployment.
alter table public.file_details
  add column if not exists storage_object_id uuid;

alter table public.entries
  add column if not exists cover_storage_object_id uuid;

alter table public.anime_library
  add column if not exists cover_storage_object_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'file_details_storage_object_id_fkey'
      and conrelid = 'public.file_details'::regclass
  ) then
    alter table public.file_details
      add constraint file_details_storage_object_id_fkey
      foreign key (storage_object_id) references public.storage_objects(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'entries_cover_storage_object_id_fkey'
      and conrelid = 'public.entries'::regclass
  ) then
    alter table public.entries
      add constraint entries_cover_storage_object_id_fkey
      foreign key (cover_storage_object_id) references public.storage_objects(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'anime_library_cover_storage_object_id_fkey'
      and conrelid = 'public.anime_library'::regclass
  ) then
    alter table public.anime_library
      add constraint anime_library_cover_storage_object_id_fkey
      foreign key (cover_storage_object_id) references public.storage_objects(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists file_details_storage_object_id_uidx
  on public.file_details (storage_object_id)
  where storage_object_id is not null;
create index if not exists entries_cover_storage_object_id_idx
  on public.entries (cover_storage_object_id)
  where cover_storage_object_id is not null;
create index if not exists anime_library_cover_storage_object_id_idx
  on public.anime_library (cover_storage_object_id)
  where cover_storage_object_id is not null;

