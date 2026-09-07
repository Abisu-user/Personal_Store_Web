-- Complete administrator-managed per-account quota system.

create table if not exists public.quota_system_settings (
  singleton boolean primary key default true check (singleton),
  default_database_limit_bytes bigint not null check (default_database_limit_bytes > 0),
  default_storage_limit_bytes bigint not null check (default_storage_limit_bytes > 0),
  maximum_database_limit_bytes bigint not null check (maximum_database_limit_bytes >= default_database_limit_bytes),
  maximum_storage_limit_bytes bigint not null check (maximum_storage_limit_bytes >= default_storage_limit_bytes),
  updated_at timestamptz not null default now()
);

insert into public.quota_system_settings (
  singleton,
  default_database_limit_bytes,
  default_storage_limit_bytes,
  maximum_database_limit_bytes,
  maximum_storage_limit_bytes
) values (true, 26214400, 524288000, 524288000, 10737418240)
on conflict (singleton) do update set
  default_database_limit_bytes = excluded.default_database_limit_bytes,
  default_storage_limit_bytes = excluded.default_storage_limit_bytes,
  maximum_database_limit_bytes = excluded.maximum_database_limit_bytes,
  maximum_storage_limit_bytes = excluded.maximum_storage_limit_bytes,
  updated_at = now();

alter table public.user_storage_quotas
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists database_unlimited boolean not null default false,
  add column if not exists storage_unlimited boolean not null default false;

alter table public.user_storage_quotas
  alter column database_quota_bytes set default 26214400,
  alter column storage_quota_bytes set default 524288000;

insert into public.user_storage_quotas (user_id, database_quota_bytes, storage_quota_bytes)
select profile.id, settings.default_database_limit_bytes, settings.default_storage_limit_bytes
from public.profiles profile
cross join public.quota_system_settings settings
on conflict (user_id) do nothing;

create table if not exists public.quota_change_logs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  old_database_limit_bytes bigint not null,
  new_database_limit_bytes bigint not null,
  old_storage_limit_bytes bigint not null,
  new_storage_limit_bytes bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists quota_change_logs_target_idx
  on public.quota_change_logs (target_user_id, created_at desc);
create index if not exists quota_change_logs_admin_idx
  on public.quota_change_logs (changed_by, created_at desc);

alter table public.quota_system_settings enable row level security;
alter table public.quota_change_logs enable row level security;
revoke all on public.quota_system_settings, public.quota_change_logs from anon, authenticated;
grant select, insert, update, delete on public.quota_system_settings, public.quota_change_logs to service_role;

create or replace function public.vault_app_create_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare settings public.quota_system_settings%rowtype;
begin
  select * into settings from public.quota_system_settings where singleton;
  insert into public.user_storage_quotas (user_id, database_quota_bytes, storage_quota_bytes)
  values (new.id, coalesce(settings.default_database_limit_bytes, 26214400), coalesce(settings.default_storage_limit_bytes, 524288000))
  on conflict (user_id) do nothing;
  return new;
end;
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
  settings public.quota_system_settings%rowtype;
  database_usage jsonb;
  storage_usage jsonb;
begin
  select * into settings from public.quota_system_settings where singleton;
  select * into quota_row from public.user_storage_quotas where user_id = target_user_id;
  select public.vault_user_database_usage(target_user_id) into database_usage;
  select public.vault_user_storage_usage(target_user_id) into storage_usage;
  return jsonb_build_object(
    'databaseUsedBytes', coalesce((database_usage ->> 'usedBytes')::bigint, 0),
    'databaseQuotaBytes', coalesce(quota_row.database_quota_bytes, settings.default_database_limit_bytes, 26214400),
    'databaseUnlimited', coalesce(quota_row.database_unlimited, false),
    'databaseGroups', coalesce(database_usage -> 'groups', '[]'::jsonb),
    'storageUsedBytes', coalesce((storage_usage ->> 'usedBytes')::bigint, 0),
    'storageQuotaBytes', coalesce(quota_row.storage_quota_bytes, settings.default_storage_limit_bytes, 524288000),
    'storageUnlimited', coalesce(quota_row.storage_unlimited, false),
    'storageGroups', coalesce(storage_usage -> 'groups', '[]'::jsonb),
    'quotaUpdatedAt', quota_row.updated_at,
    'collectedAt', now()
  );
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
  is_unlimited boolean;
  current_bytes bigint;
  growth_bytes bigint;
begin
  account_id := public.vault_quota_owner_for_row(tg_table_name, to_jsonb(new));
  if account_id is null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vault-quota:' || account_id::text, 0));
  growth_bytes := pg_column_size(new);
  if tg_op = 'UPDATE' then growth_bytes := greatest(growth_bytes - pg_column_size(old), 0); end if;
  if growth_bytes = 0 then return new; end if;
  select database_quota_bytes, database_unlimited into quota_bytes, is_unlimited
  from public.user_storage_quotas where user_id = account_id;
  if coalesce(is_unlimited, false) then return new; end if;
  if quota_bytes is null then
    select default_database_limit_bytes into quota_bytes from public.quota_system_settings where singleton;
  end if;
  quota_bytes := coalesce(quota_bytes, 26214400);
  current_bytes := public.vault_user_database_bytes(account_id);
  if current_bytes + growth_bytes > quota_bytes then
    raise exception using errcode = 'P0001', message = 'quota_exceeded:database';
  end if;
  return new;
end;
$$;

-- Storage uploads are sent to signed URLs, so browser-reported file.size is
-- only a fast preflight. This trigger is the authoritative second check using
-- the object metadata written by Supabase Storage itself.
create or replace function public.vault_enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  account_id uuid;
  quota_bytes bigint;
  is_unlimited boolean;
  current_bytes bigint;
  new_bytes bigint;
  old_bytes bigint;
  growth_bytes bigint;
begin
  if split_part(new.name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;
  account_id := split_part(new.name, '/', 1)::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vault-quota:' || account_id::text, 0));
  new_bytes := greatest(coalesce((new.metadata ->> 'size')::bigint, 0), 0);
  old_bytes := case when tg_op = 'UPDATE' then greatest(coalesce((old.metadata ->> 'size')::bigint, 0), 0) else 0 end;
  growth_bytes := greatest(new_bytes - old_bytes, 0);
  if growth_bytes = 0 then return new; end if;

  select storage_quota_bytes, storage_unlimited into quota_bytes, is_unlimited
  from public.user_storage_quotas where user_id = account_id;
  if coalesce(is_unlimited, false) then return new; end if;
  if quota_bytes is null then
    select default_storage_limit_bytes into quota_bytes from public.quota_system_settings where singleton;
  end if;
  quota_bytes := coalesce(quota_bytes, 524288000);
  current_bytes := coalesce((public.vault_user_storage_usage(account_id) ->> 'usedBytes')::bigint, 0);
  if current_bytes + growth_bytes > quota_bytes then
    raise exception using errcode = 'P0001', message = 'quota_exceeded:storage';
  end if;
  return new;
end;
$$;

drop trigger if exists vault_enforce_user_storage_quota on storage.objects;
create trigger vault_enforce_user_storage_quota
before insert or update of name, metadata on storage.objects
for each row execute function public.vault_enforce_storage_quota();

create or replace function public.vault_admin_user_capacity_page_v2(
  search_term text default '',
  page_number integer default 1,
  page_size integer default 20,
  filter_mode text default 'all'
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with account_capacity as (
    select users.id, users.email::text, profiles.username::text, profiles.display_name,
      profiles.role, public.vault_user_capacity(users.id) as capacity
    from auth.users users
    join public.profiles profiles on profiles.id = users.id
    where users.deleted_at is null
      and (btrim(search_term) = '' or users.email ilike '%' || btrim(search_term) || '%'
        or profiles.username::text ilike '%' || btrim(search_term) || '%'
        or coalesce(profiles.display_name, '') ilike '%' || btrim(search_term) || '%')
  ), matched as (
    select * from account_capacity
    where filter_mode = 'all'
      or (filter_mode = 'user' and role = 'user')
      or (filter_mode = 'admin' and role = 'admin')
      or (filter_mode = 'database-near' and (capacity ->> 'databaseUsedBytes')::numeric / greatest((capacity ->> 'databaseQuotaBytes')::numeric, 1) >= 0.8)
      or (filter_mode = 'storage-near' and (capacity ->> 'storageUsedBytes')::numeric / greatest((capacity ->> 'storageQuotaBytes')::numeric, 1) >= 0.8)
      or (filter_mode = 'full' and ((capacity ->> 'databaseUsedBytes')::numeric >= (capacity ->> 'databaseQuotaBytes')::numeric
        or (capacity ->> 'storageUsedBytes')::numeric >= (capacity ->> 'storageQuotaBytes')::numeric))
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
      'username', page_rows.username,
      'displayName', page_rows.display_name,
      'role', page_rows.role,
      'capacity', page_rows.capacity
    ) order by lower(page_rows.email)), '[]'::jsonb)
  ) from page_rows;
$$;

create or replace function public.vault_admin_update_user_quota(
  acting_admin_id uuid,
  target_user_id uuid,
  new_database_limit_bytes bigint,
  new_storage_limit_bytes bigint,
  expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  quota_row public.user_storage_quotas%rowtype;
  settings public.quota_system_settings%rowtype;
  capacity jsonb;
  database_used bigint;
  storage_used bigint;
begin
  if not exists (select 1 from public.profiles where id = acting_admin_id and role = 'admin') then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vault-quota:' || target_user_id::text, 0));
  select * into settings from public.quota_system_settings where singleton;
  if new_database_limit_bytes is null or new_storage_limit_bytes is null
    or new_database_limit_bytes <= 0 or new_storage_limit_bytes <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_QUOTA';
  end if;
  if new_database_limit_bytes > settings.maximum_database_limit_bytes
    or new_storage_limit_bytes > settings.maximum_storage_limit_bytes then
    raise exception using errcode = 'P0001', message = 'QUOTA_ABOVE_MAX';
  end if;

  select * into quota_row from public.user_storage_quotas where user_id = target_user_id for update;
  if not found then
    if expected_updated_at is not null then
      raise exception using errcode = 'P0001', message = 'QUOTA_CONFLICT';
    end if;
    insert into public.user_storage_quotas (user_id, database_quota_bytes, storage_quota_bytes)
    values (target_user_id, settings.default_database_limit_bytes, settings.default_storage_limit_bytes)
    returning * into quota_row;
  elsif quota_row.updated_at is distinct from expected_updated_at then
    raise exception using errcode = 'P0001', message = 'QUOTA_CONFLICT';
  end if;

  capacity := public.vault_user_capacity(target_user_id);
  database_used := coalesce((capacity ->> 'databaseUsedBytes')::bigint, 0);
  storage_used := coalesce((capacity ->> 'storageUsedBytes')::bigint, 0);
  if new_database_limit_bytes < database_used then
    raise exception using errcode = 'P0001', message = 'QUOTA_BELOW_USAGE:database:' || database_used;
  end if;
  if new_storage_limit_bytes < storage_used then
    raise exception using errcode = 'P0001', message = 'QUOTA_BELOW_USAGE:storage:' || storage_used;
  end if;

  update public.user_storage_quotas set
    database_quota_bytes = new_database_limit_bytes,
    storage_quota_bytes = new_storage_limit_bytes,
    updated_by = acting_admin_id,
    updated_at = now()
  where user_id = target_user_id;

  insert into public.quota_change_logs (
    target_user_id, changed_by,
    old_database_limit_bytes, new_database_limit_bytes,
    old_storage_limit_bytes, new_storage_limit_bytes
  ) values (
    target_user_id, acting_admin_id,
    quota_row.database_quota_bytes, new_database_limit_bytes,
    quota_row.storage_quota_bytes, new_storage_limit_bytes
  );

  return public.vault_user_capacity(target_user_id);
end;
$$;

revoke all on function public.vault_admin_user_capacity_page_v2(text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.vault_admin_update_user_quota(uuid, uuid, bigint, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.vault_admin_user_capacity_page_v2(text, integer, integer, text) to service_role;
grant execute on function public.vault_admin_update_user_quota(uuid, uuid, bigint, bigint, timestamptz) to service_role;
revoke all on function public.vault_enforce_storage_quota() from public, anon, authenticated;

notify pgrst, 'reload schema';
