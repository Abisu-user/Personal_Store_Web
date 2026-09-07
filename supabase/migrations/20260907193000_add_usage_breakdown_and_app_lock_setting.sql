-- User-friendly capacity breakdown and server-backed App auto-lock setting.

alter table public.user_settings
  add column if not exists app_auto_lock_enabled boolean;

-- App lock was always enabled before this column existed. Preserve that
-- behaviour for existing accounts; only future rows use the new OFF default.
update public.user_settings
set app_auto_lock_enabled = true
where app_auto_lock_enabled is null;

alter table public.user_settings
  alter column app_auto_lock_enabled set default false,
  alter column app_auto_lock_enabled set not null;

create or replace function public.vault_user_database_usage(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  groups jsonb := '{}'::jsonb;
  relation record;
  relation_bytes bigint;
  group_key text;
  item record;
  total_bytes bigint := 0;
begin
  if target_user_id is null then
    return jsonb_build_object('usedBytes', 0, 'groups', '[]'::jsonb);
  end if;

  for relation in
    select c.oid::regclass as relation_name, c.relname,
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
        'profiles', 'entries', 'user_storage_quotas', 'system_vocabulary',
        'dictionary_sources', 'dictionary_entries', 'dictionary_translations',
        'vocabulary_collections', 'vocabulary_collection_entries',
        'vocabulary_dataset_imports', 'vocabulary_catalog_admins',
        'auth_verification_flows', 'auth_otp_send_events'
      )
  loop
    if relation.owner_column is not null then
      execute format(
        'select coalesce(sum(pg_column_size(row_value)), 0)::bigint from %s row_value where %I = $1',
        relation.relation_name,
        relation.owner_column
      ) into relation_bytes using target_user_id;

      group_key := case
        when relation.relname like 'anime_%' then 'anime'
        when relation.relname like 'vocabulary_%' then 'vocabulary'
        when relation.relname like 'vault%' then 'vault'
        when relation.relname like 'calendar_%' then 'calendar'
        when relation.relname in ('bookmark_folders') then 'bookmarks'
        when relation.relname in ('content_folders','categories','tags','folder_locks','folder_unlock_sessions') then 'organization'
        when relation.relname in ('user_settings','user_appearance_settings','device_sessions','audit_logs','app_locks','adult_content_permissions','password_reset_authorizations') then 'account'
        else 'other'
      end;
      groups := jsonb_set(groups, array[group_key], to_jsonb(coalesce((groups ->> group_key)::bigint, 0) + coalesce(relation_bytes, 0)), true);
    end if;
  end loop;

  select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes
  from public.profiles row_value where id = target_user_id;
  groups := jsonb_set(groups, '{account}', to_jsonb(coalesce((groups ->> 'account')::bigint, 0) + relation_bytes), true);

  for item in
    select case kind::text
      when 'bookmark' then 'bookmarks'
      when 'note' then 'notes'
      when 'code' then 'code'
      when 'file' then 'files'
      when 'photo' then 'photos'
      when 'vault_item' then 'vault'
      else 'other'
    end as key, sum(pg_column_size(row_value))::bigint as bytes
    from public.entries row_value
    where owner_id = target_user_id
    group by 1
  loop
    groups := jsonb_set(groups, array[item.key], to_jsonb(coalesce((groups ->> item.key)::bigint, 0) + item.bytes), true);
  end loop;

  if to_regclass('public.entry_tags') is not null then
    for item in
      select case parent.kind::text
        when 'bookmark' then 'bookmarks' when 'note' then 'notes'
        when 'code' then 'code' when 'file' then 'files'
        when 'photo' then 'photos' when 'vault_item' then 'vault'
        else 'other' end as key,
        sum(pg_column_size(row_value))::bigint as bytes
      from public.entry_tags row_value
      join public.entries parent on parent.id = row_value.entry_id
      where parent.owner_id = target_user_id group by 1
    loop
      groups := jsonb_set(groups, array[item.key], to_jsonb(coalesce((groups ->> item.key)::bigint, 0) + item.bytes), true);
    end loop;
  end if;

  if to_regclass('public.bookmark_details') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.bookmark_details row_value join public.entries parent on parent.id = row_value.entry_id where parent.owner_id = target_user_id;
    groups := jsonb_set(groups, '{bookmarks}', to_jsonb(coalesce((groups ->> 'bookmarks')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.note_details') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.note_details row_value join public.entries parent on parent.id = row_value.entry_id where parent.owner_id = target_user_id;
    groups := jsonb_set(groups, '{notes}', to_jsonb(coalesce((groups ->> 'notes')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.note_versions') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.note_versions row_value join public.entries parent on parent.id = row_value.entry_id where parent.owner_id = target_user_id;
    groups := jsonb_set(groups, '{notes}', to_jsonb(coalesce((groups ->> 'notes')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.code_details') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.code_details row_value join public.entries parent on parent.id = row_value.entry_id where parent.owner_id = target_user_id;
    groups := jsonb_set(groups, '{code}', to_jsonb(coalesce((groups ->> 'code')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.file_details') is not null then
    for item in
      select case parent.kind::text when 'photo' then 'photos' else 'files' end as key,
        sum(pg_column_size(row_value))::bigint as bytes
      from public.file_details row_value join public.entries parent on parent.id = row_value.entry_id
      where parent.owner_id = target_user_id group by 1
    loop
      groups := jsonb_set(groups, array[item.key], to_jsonb(coalesce((groups ->> item.key)::bigint, 0) + item.bytes), true);
    end loop;
  end if;
  if to_regclass('public.vault_payloads') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.vault_payloads row_value join public.entries parent on parent.id = row_value.entry_id where parent.owner_id = target_user_id;
    groups := jsonb_set(groups, '{vault}', to_jsonb(coalesce((groups ->> 'vault')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.anime_library_tags') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.anime_library_tags row_value join public.anime_library parent on parent.id = row_value.anime_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{anime}', to_jsonb(coalesce((groups ->> 'anime')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.anime_library_folders') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.anime_library_folders row_value join public.anime_library parent on parent.id = row_value.anime_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{anime}', to_jsonb(coalesce((groups ->> 'anime')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.vocabulary_meanings') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.vocabulary_meanings row_value join public.vocabulary_cards parent on parent.id = row_value.card_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{vocabulary}', to_jsonb(coalesce((groups ->> 'vocabulary')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.vocabulary_examples') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.vocabulary_examples row_value join public.vocabulary_cards parent on parent.id = row_value.card_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{vocabulary}', to_jsonb(coalesce((groups ->> 'vocabulary')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.vocabulary_card_tags') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.vocabulary_card_tags row_value join public.vocabulary_cards parent on parent.id = row_value.card_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{vocabulary}', to_jsonb(coalesce((groups ->> 'vocabulary')::bigint, 0) + relation_bytes), true);
  end if;
  if to_regclass('public.vocabulary_deck_cards') is not null then
    select coalesce(sum(pg_column_size(row_value)), 0)::bigint into relation_bytes from public.vocabulary_deck_cards row_value join public.vocabulary_decks parent on parent.id = row_value.deck_id where parent.user_id = target_user_id;
    groups := jsonb_set(groups, '{vocabulary}', to_jsonb(coalesce((groups ->> 'vocabulary')::bigint, 0) + relation_bytes), true);
  end if;

  select coalesce(sum(value::bigint), 0)::bigint into total_bytes from jsonb_each_text(groups);
  return jsonb_build_object(
    'usedBytes', total_bytes,
    'groups', coalesce((select jsonb_agg(jsonb_build_object('category', key, 'usedBytes', value::bigint) order by value::bigint desc) from jsonb_each_text(groups) where value::bigint > 0), '[]'::jsonb)
  );
end;
$$;

create or replace function public.vault_user_database_bytes(target_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((public.vault_user_database_usage(target_user_id) ->> 'usedBytes')::bigint, 0);
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
  database_usage jsonb;
  storage_usage jsonb;
begin
  select * into quota_row from public.user_storage_quotas where user_id = target_user_id;
  select public.vault_user_database_usage(target_user_id) into database_usage;
  select public.vault_user_storage_usage(target_user_id) into storage_usage;
  return jsonb_build_object(
    'databaseUsedBytes', coalesce((database_usage ->> 'usedBytes')::bigint, 0),
    'databaseQuotaBytes', coalesce(quota_row.database_quota_bytes, 104857600),
    'databaseGroups', coalesce(database_usage -> 'groups', '[]'::jsonb),
    'storageUsedBytes', coalesce((storage_usage ->> 'usedBytes')::bigint, 0),
    'storageQuotaBytes', coalesce(quota_row.storage_quota_bytes, 209715200),
    'storageGroups', coalesce(storage_usage -> 'groups', '[]'::jsonb),
    'collectedAt', now()
  );
end;
$$;

revoke all on function public.vault_user_database_usage(uuid) from public, anon, authenticated;
grant execute on function public.vault_user_database_usage(uuid) to service_role;

notify pgrst, 'reload schema';
