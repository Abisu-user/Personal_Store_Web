-- Account-scoped appearance and per-user capacity enforcement.

create table if not exists public.user_appearance_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_type text not null check (device_type in ('desktop', 'mobile')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_type)
);

create table if not exists public.user_storage_quotas (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  database_quota_bytes bigint not null default 104857600 check (database_quota_bytes > 0),
  storage_quota_bytes bigint not null default 209715200 check (storage_quota_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_storage_quotas (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.vault_app_create_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_storage_quotas (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists vault_app_create_user_defaults on public.profiles;
create trigger vault_app_create_user_defaults
after insert on public.profiles
for each row execute procedure public.vault_app_create_user_defaults();

drop trigger if exists vault_app_user_appearance_updated_at on public.user_appearance_settings;
create trigger vault_app_user_appearance_updated_at
before update on public.user_appearance_settings
for each row execute procedure public.vault_app_set_updated_at();

drop trigger if exists vault_app_user_storage_quotas_updated_at on public.user_storage_quotas;
create trigger vault_app_user_storage_quotas_updated_at
before update on public.user_storage_quotas
for each row execute procedure public.vault_app_set_updated_at();

alter table public.user_appearance_settings enable row level security;
alter table public.user_storage_quotas enable row level security;
revoke all on public.user_appearance_settings, public.user_storage_quotas from anon, authenticated;
grant select, insert, update, delete on public.user_appearance_settings, public.user_storage_quotas to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-backgrounds', 'workspace-backgrounds', false, 8388608)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Returns payload bytes owned by one account. Shared dictionaries and indexes
-- are intentionally excluded because they cannot be attributed to one user.
create or replace function public.vault_user_database_bytes(target_user_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  result bigint := 0;
  relation record;
  relation_bytes bigint;
begin
  if target_user_id is null then return 0; end if;

  for relation in
    select c.oid::regclass as relation_name,
      case
        when exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) then 'user_id'
        when exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped) then 'owner_id'
        else null
      end as owner_column
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (
        'user_storage_quotas', 'system_vocabulary', 'dictionary_sources',
        'dictionary_entries', 'dictionary_translations', 'vocabulary_collections',
        'vocabulary_collection_entries', 'vocabulary_dataset_imports',
        'vocabulary_catalog_admins', 'auth_verification_flows', 'auth_otp_send_events'
      )
  loop
    if relation.owner_column is not null then
      execute format(
        'select coalesce(sum(pg_column_size(row_value)), 0)::bigint from %s row_value where %I = $1',
        relation.relation_name,
        relation.owner_column
      ) into relation_bytes using target_user_id;
      result := result + coalesce(relation_bytes, 0);
    end if;
  end loop;

  if to_regclass('public.profiles') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint
      into result from public.profiles row_value where id = target_user_id;
  end if;

  if to_regclass('public.entry_tags') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.entry_tags row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.bookmark_details') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.bookmark_details row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.note_details') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.note_details row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.note_versions') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.note_versions row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.code_details') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.code_details row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.file_details') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.file_details row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.vault_payloads') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.vault_payloads row_value join public.entries parent on parent.id = row_value.entry_id
    where parent.owner_id = target_user_id;
  end if;
  if to_regclass('public.anime_library_tags') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.anime_library_tags row_value join public.anime_library parent on parent.id = row_value.anime_id
    where parent.user_id = target_user_id;
  end if;
  if to_regclass('public.anime_library_folders') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.anime_library_folders row_value join public.anime_library parent on parent.id = row_value.anime_id
    where parent.user_id = target_user_id;
  end if;
  if to_regclass('public.vocabulary_meanings') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.vocabulary_meanings row_value join public.vocabulary_cards parent on parent.id = row_value.card_id
    where parent.user_id = target_user_id;
  end if;
  if to_regclass('public.vocabulary_examples') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.vocabulary_examples row_value join public.vocabulary_cards parent on parent.id = row_value.card_id
    where parent.user_id = target_user_id;
  end if;
  if to_regclass('public.vocabulary_card_tags') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.vocabulary_card_tags row_value join public.vocabulary_cards parent on parent.id = row_value.card_id
    where parent.user_id = target_user_id;
  end if;
  if to_regclass('public.vocabulary_deck_cards') is not null then
    select result + coalesce(sum(pg_column_size(row_value)), 0)::bigint into result
    from public.vocabulary_deck_cards row_value join public.vocabulary_decks parent on parent.id = row_value.deck_id
    where parent.user_id = target_user_id;
  end if;

  return greatest(result, 0);
end;
$$;

create or replace function public.vault_user_storage_usage(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
  with owned as (
    select
      case
        when bucket_id = 'vault-files' and name like target_user_id::text || '/photos/%' then 'photos'
        when bucket_id = 'vault-files' then 'files'
        when bucket_id = 'content-covers' then 'content-covers'
        when bucket_id = 'workspace-backgrounds' then 'workspace-backgrounds'
        else bucket_id
      end as category,
      case when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
        then (metadata ->> 'size')::bigint else 0 end as byte_size
    from storage.objects
    where name like target_user_id::text || '/%'
  ), grouped as (
    select category, sum(byte_size)::bigint as used_bytes from owned group by category
  )
  select jsonb_build_object(
    'usedBytes', coalesce((select sum(used_bytes) from grouped), 0),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'usedBytes', used_bytes) order by used_bytes desc) from grouped), '[]'::jsonb)
  );
$$;

create or replace function public.vault_user_capacity(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  quota_row public.user_storage_quotas%rowtype;
  storage_usage jsonb;
begin
  select * into quota_row from public.user_storage_quotas where user_id = target_user_id;
  select public.vault_user_storage_usage(target_user_id) into storage_usage;
  return jsonb_build_object(
    'databaseUsedBytes', public.vault_user_database_bytes(target_user_id),
    'databaseQuotaBytes', coalesce(quota_row.database_quota_bytes, 104857600),
    'storageUsedBytes', coalesce((storage_usage ->> 'usedBytes')::bigint, 0),
    'storageQuotaBytes', coalesce(quota_row.storage_quota_bytes, 209715200),
    'storageGroups', coalesce(storage_usage -> 'groups', '[]'::jsonb),
    'collectedAt', now()
  );
end;
$$;

create or replace function public.vault_admin_user_capacity_page(
  search_term text default '',
  page_number integer default 1,
  page_size integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with matched as (
    select users.id, users.email::text, profiles.display_name
    from auth.users users
    join public.profiles profiles on profiles.id = users.id
    where users.deleted_at is null
      and (btrim(search_term) = '' or users.email ilike '%' || btrim(search_term) || '%'
        or coalesce(profiles.display_name, '') ilike '%' || btrim(search_term) || '%')
  ), page_rows as (
    select * from matched order by lower(email)
    limit least(greatest(page_size, 1), 50)
    offset (greatest(page_number, 1) - 1) * least(greatest(page_size, 1), 50)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'users', coalesce(jsonb_agg(jsonb_build_object(
      'userId', page_rows.id,
      'email', page_rows.email,
      'displayName', page_rows.display_name,
      'capacity', public.vault_user_capacity(page_rows.id)
    ) order by lower(page_rows.email)), '[]'::jsonb)
  ) from page_rows;
$$;

revoke all on function public.vault_user_database_bytes(uuid) from public, anon, authenticated;
revoke all on function public.vault_user_storage_usage(uuid) from public, anon, authenticated;
revoke all on function public.vault_user_capacity(uuid) from public, anon, authenticated;
revoke all on function public.vault_admin_user_capacity_page(text, integer, integer) from public, anon, authenticated;
grant execute on function public.vault_user_database_bytes(uuid) to service_role;
grant execute on function public.vault_user_storage_usage(uuid) to service_role;
grant execute on function public.vault_user_capacity(uuid) to service_role;
grant execute on function public.vault_admin_user_capacity_page(text, integer, integer) to service_role;

-- Database quota is enforced inside PostgreSQL so service-role API routes and
-- any future direct authenticated writes cannot bypass it.
create or replace function public.vault_quota_owner_for_row(table_name text, row_data jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare result uuid;
begin
  if row_data ? 'user_id' then return nullif(row_data ->> 'user_id', '')::uuid; end if;
  if row_data ? 'owner_id' then return nullif(row_data ->> 'owner_id', '')::uuid; end if;
  if table_name = 'profiles' then return nullif(row_data ->> 'id', '')::uuid; end if;
  if table_name in ('entry_tags','bookmark_details','note_details','note_versions','code_details','file_details','vault_payloads') then
    select owner_id into result from public.entries where id = (row_data ->> 'entry_id')::uuid;
  elsif table_name in ('anime_library_tags','anime_library_folders') then
    select user_id into result from public.anime_library where id = (row_data ->> 'anime_id')::uuid;
  elsif table_name in ('vocabulary_meanings','vocabulary_examples','vocabulary_card_tags') then
    select user_id into result from public.vocabulary_cards where id = (row_data ->> 'card_id')::uuid;
  elsif table_name = 'vocabulary_deck_cards' then
    select user_id into result from public.vocabulary_decks where id = (row_data ->> 'deck_id')::uuid;
  end if;
  return result;
end;
$$;

create or replace function public.vault_enforce_database_quota()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account_id uuid;
  quota_bytes bigint;
  current_bytes bigint;
  growth_bytes bigint;
begin
  account_id := public.vault_quota_owner_for_row(tg_table_name, to_jsonb(new));
  if account_id is null then return new; end if;
  growth_bytes := pg_column_size(new);
  if tg_op = 'UPDATE' then growth_bytes := greatest(growth_bytes - pg_column_size(old), 0); end if;
  if growth_bytes = 0 then return new; end if;
  select database_quota_bytes into quota_bytes from public.user_storage_quotas where user_id = account_id;
  quota_bytes := coalesce(quota_bytes, 104857600);
  current_bytes := public.vault_user_database_bytes(account_id);
  if current_bytes + growth_bytes > quota_bytes then
    raise exception using errcode = 'P0001', message = 'quota_exceeded:database';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','user_settings','user_appearance_settings','categories','tags','entries',
    'entry_tags','bookmark_details','note_details','note_versions','code_details','file_details',
    'vaults','vault_payloads','device_sessions','audit_logs','calendar_events','bookmark_folders',
    'content_folders','app_locks','folder_locks','folder_unlock_sessions','anime_library',
    'anime_tags','anime_library_tags','anime_watch_logs','anime_folders','anime_library_folders',
    'anime_preferences','vocabulary_cards','vocabulary_meanings','vocabulary_examples',
    'vocabulary_tags','vocabulary_card_tags','vocabulary_decks','vocabulary_deck_cards',
    'vocabulary_review_logs','vocabulary_settings','vocabulary_search_history','vocabulary_ai_cache',
    'adult_content_permissions','password_reset_authorizations'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists vault_enforce_database_quota on public.%I', table_name);
      execute format('create trigger vault_enforce_database_quota before insert or update on public.%I for each row execute procedure public.vault_enforce_database_quota()', table_name);
    end if;
  end loop;
end $$;

revoke all on function public.vault_quota_owner_for_row(text, jsonb) from public, anon, authenticated;
revoke all on function public.vault_enforce_database_quota() from public, anon, authenticated;

notify pgrst, 'reload schema';
