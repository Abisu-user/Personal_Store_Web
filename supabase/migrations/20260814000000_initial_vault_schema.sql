-- Personal Digital Vault: foundational schema.
-- This migration deliberately stores encrypted Vault material as ciphertext only.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.security_level as enum ('standard', 'private', 'vault', 'step_up');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.entry_kind as enum ('bookmark', 'note', 'code', 'file', 'vault_item');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique check (char_length(username) between 3 and 32),
  display_name text,
  avatar_path text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  locale text not null default 'zh-TW',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  vault_auto_lock_minutes smallint not null default 10 check (vault_auto_lock_minutes in (5, 10, 15, 30, 60)),
  inactivity_logout_minutes smallint not null default 30 check (inactivity_logout_minutes in (15, 30, 60, 120)),
  track_open_events boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name citext not null check (char_length(name) between 1 and 50),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind public.entry_kind not null,
  security_level public.security_level not null default 'standard',
  title text not null check (char_length(title) between 1 and 300),
  description text,
  category_id uuid references public.categories(id) on delete set null,
  is_favorite boolean not null default false,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  deleted_at timestamptz,
  last_opened_at timestamptz,
  opened_count integer not null default 0 check (opened_count >= 0),
  requires_item_password boolean not null default false,
  item_password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((requires_item_password and item_password_hash is not null) or (not requires_item_password and item_password_hash is null))
);

create table if not exists public.entry_tags (
  entry_id uuid not null references public.entries(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, tag_id)
);

create table if not exists public.bookmark_details (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  url text not null check (url ~* '^https?://'),
  favicon_url text,
  site_title text,
  notes text
);

create table if not exists public.note_details (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  content_markdown text not null default '',
  current_version integer not null default 1 check (current_version > 0)
);

create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  version integer not null check (version > 0),
  content_markdown text not null,
  created_at timestamptz not null default now(),
  unique (entry_id, version)
);

create table if not exists public.code_details (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  language text not null check (char_length(language) between 1 and 50),
  source_code text not null
);

create table if not exists public.file_details (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 bytea not null check (octet_length(sha256) = 32),
  is_client_encrypted boolean not null default false,
  encryption_nonce bytea,
  created_at timestamptz not null default now(),
  check ((is_client_encrypted and encryption_nonce is not null) or (not is_client_encrypted and encryption_nonce is null))
);

create table if not exists public.vaults (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  kdf_salt bytea not null check (octet_length(kdf_salt) >= 16),
  kdf_parameters jsonb not null,
  wrapped_vault_key bytea not null,
  wrapped_key_nonce bytea not null check (octet_length(wrapped_key_nonce) = 12),
  encryption_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_payloads (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  ciphertext bytea not null,
  nonce bytea not null check (octet_length(nonce) = 12),
  aad jsonb not null default '{}'::jsonb,
  encryption_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid,
  device_label text,
  user_agent text,
  ip_hash bytea,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 100),
  entry_id uuid references public.entries(id) on delete set null,
  device_session_id uuid references public.device_sessions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash bytea,
  occurred_at timestamptz not null default now()
);

create index if not exists entries_owner_active_idx on public.entries (owner_id, updated_at desc) where deleted_at is null;
create index if not exists entries_owner_kind_idx on public.entries (owner_id, kind) where deleted_at is null;
create index if not exists entries_owner_favorite_idx on public.entries (owner_id, updated_at desc) where is_favorite and deleted_at is null;
create index if not exists entry_tags_tag_idx on public.entry_tags (tag_id, entry_id);
create index if not exists note_versions_entry_idx on public.note_versions (entry_id, version desc);
create index if not exists device_sessions_owner_idx on public.device_sessions (owner_id, last_seen_at desc);
create index if not exists audit_logs_owner_idx on public.audit_logs (owner_id, occurred_at desc);

create or replace function public.vault_app_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.vault_app_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  if requested_username !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then
    raise exception 'Invalid username';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'vault_app_on_auth_user_created'
  ) then
    create trigger vault_app_on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.vault_app_handle_new_user();
  end if;
end;
$$;

create trigger vault_app_profiles_updated_at before update on public.profiles for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_user_settings_updated_at before update on public.user_settings for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_categories_updated_at before update on public.categories for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_tags_updated_at before update on public.tags for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_entries_updated_at before update on public.entries for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vaults_updated_at before update on public.vaults for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vault_payloads_updated_at before update on public.vault_payloads for each row execute procedure public.vault_app_set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.entries enable row level security;
alter table public.entry_tags enable row level security;
alter table public.bookmark_details enable row level security;
alter table public.note_details enable row level security;
alter table public.note_versions enable row level security;
alter table public.code_details enable row level security;
alter table public.file_details enable row level security;
alter table public.vaults enable row level security;
alter table public.vault_payloads enable row level security;
alter table public.device_sessions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles: owner only" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "settings: owner only" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories: owner only" on public.categories for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "tags: owner only" on public.tags for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "entries: owner only" on public.entries for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "entry tags: entry owner only" on public.entry_tags for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "bookmark details: entry owner only" on public.bookmark_details for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "note details: entry owner only" on public.note_details for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "note versions: entry owner only" on public.note_versions for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "code details: entry owner only" on public.code_details for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "file details: entry owner only" on public.file_details for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "vaults: owner only" on public.vaults for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vault payloads: entry owner only" on public.vault_payloads for all to authenticated using (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.entries e where e.id = entry_id and e.owner_id = (select auth.uid())));
create policy "device sessions: owner read only" on public.device_sessions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "audit logs: owner read only" on public.audit_logs for select to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault-files', 'vault-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- The browser receives no Storage object policy: only authenticated server routes use
-- the server-only secret key after checking ownership, re-authentication, and Vault state.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.vault_app_handle_new_user() from public;
