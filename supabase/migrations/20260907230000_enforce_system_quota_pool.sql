-- Treat project capacity as one shared pool. Per-account quota updates are
-- serialized and may not allocate more than the configured system capacity.

create or replace function public.vault_admin_quota_pool_summary()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with settings as (
    select * from public.quota_system_settings where singleton
  ), allocations as (
    select
      profiles.id as user_id,
      users.email::text as email,
      profiles.username::text as username,
      profiles.display_name,
      profiles.role,
      coalesce(quotas.database_quota_bytes, settings.default_database_limit_bytes, 26214400)::bigint as database_limit_bytes,
      coalesce(quotas.storage_quota_bytes, settings.default_storage_limit_bytes, 524288000)::bigint as storage_limit_bytes
    from public.profiles profiles
    join auth.users users on users.id = profiles.id and users.deleted_at is null
    cross join settings
    left join public.user_storage_quotas quotas on quotas.user_id = profiles.id
  )
  select jsonb_build_object(
    'databaseAllocatedBytes', coalesce(sum(database_limit_bytes), 0),
    'storageAllocatedBytes', coalesce(sum(storage_limit_bytes), 0),
    'allocations', coalesce(jsonb_agg(jsonb_build_object(
      'userId', user_id,
      'email', email,
      'username', username,
      'displayName', display_name,
      'role', role,
      'databaseLimitBytes', database_limit_bytes,
      'storageLimitBytes', storage_limit_bytes
    ) order by lower(email)), '[]'::jsonb)
  )
  from allocations;
$$;

create or replace function public.vault_admin_update_user_quota_v2(
  acting_admin_id uuid,
  target_user_id uuid,
  new_database_limit_bytes bigint,
  new_storage_limit_bytes bigint,
  expected_updated_at timestamptz,
  system_database_capacity_bytes bigint,
  system_storage_capacity_bytes bigint
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
  other_database_allocated bigint;
  other_storage_allocated bigint;
  available_database bigint;
  available_storage bigint;
begin
  if not exists (select 1 from public.profiles where id = acting_admin_id and role = 'admin') then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;
  if system_database_capacity_bytes is null or system_storage_capacity_bytes is null
    or system_database_capacity_bytes <= 0 or system_storage_capacity_bytes <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_SYSTEM_CAPACITY';
  end if;

  -- One global lock is required because changing A also changes the capacity
  -- available to B. A target-only row lock would allow concurrent over-allocation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vault-quota-system-pool', 0));
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

  select
    coalesce(sum(coalesce(quotas.database_quota_bytes, settings.default_database_limit_bytes)), 0),
    coalesce(sum(coalesce(quotas.storage_quota_bytes, settings.default_storage_limit_bytes)), 0)
  into other_database_allocated, other_storage_allocated
  from public.profiles profiles
  left join public.user_storage_quotas quotas on quotas.user_id = profiles.id
  where profiles.id <> target_user_id;

  available_database := greatest(system_database_capacity_bytes - other_database_allocated, 0);
  available_storage := greatest(system_storage_capacity_bytes - other_storage_allocated, 0);

  -- Existing installations may already be over-allocated. A reduction is
  -- still allowed so an administrator can repair the pool incrementally, but
  -- an update may never make the over-allocation worse.
  if new_database_limit_bytes > available_database
    and new_database_limit_bytes > quota_row.database_quota_bytes then
    raise exception using errcode = 'P0001', message = 'SYSTEM_QUOTA_POOL_EXCEEDED:database:' || available_database;
  end if;
  if new_storage_limit_bytes > available_storage
    and new_storage_limit_bytes > quota_row.storage_quota_bytes then
    raise exception using errcode = 'P0001', message = 'SYSTEM_QUOTA_POOL_EXCEEDED:storage:' || available_storage;
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

revoke all on function public.vault_admin_quota_pool_summary() from public, anon, authenticated;
revoke all on function public.vault_admin_update_user_quota_v2(uuid, uuid, bigint, bigint, timestamptz, bigint, bigint) from public, anon, authenticated;
grant execute on function public.vault_admin_quota_pool_summary() to service_role;
grant execute on function public.vault_admin_update_user_quota_v2(uuid, uuid, bigint, bigint, timestamptz, bigint, bigint) to service_role;

notify pgrst, 'reload schema';
