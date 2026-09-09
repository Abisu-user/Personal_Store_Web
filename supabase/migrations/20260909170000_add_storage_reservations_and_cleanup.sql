-- Phase 5: atomic external-storage quota reservations and retryable orphan cleanup.
-- Additive only: no existing object, account, or metadata row is deleted or moved.

alter table public.storage_objects
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists cleanup_claimed_at timestamptz,
  add column if not exists cleanup_attempts integer not null default 0,
  add column if not exists cleanup_last_error text;

alter table public.storage_objects
  drop constraint if exists storage_objects_cleanup_attempts_check;
alter table public.storage_objects
  add constraint storage_objects_cleanup_attempts_check
  check (cleanup_attempts >= 0) not valid;
alter table public.storage_objects
  validate constraint storage_objects_cleanup_attempts_check;

create index if not exists storage_objects_expired_reservation_idx
  on public.storage_objects (reservation_expires_at, created_at)
  where status = 'pending' and deleted_at is null;
create index if not exists storage_objects_stale_cleanup_claim_idx
  on public.storage_objects (cleanup_claimed_at)
  where status = 'deleting' and deleted_at is null;

comment on column public.storage_objects.reservation_expires_at is
  'Pending external uploads reserve byte_size until finalized, failed, or safely cleaned.';
comment on column public.storage_objects.cleanup_claimed_at is
  'Set while one cleanup worker owns an expired pending object.';
comment on column public.storage_objects.cleanup_attempts is
  'Retry counter for idempotent provider-object cleanup.';
comment on column public.storage_objects.cleanup_last_error is
  'Last provider cleanup error; contains no credentials or signed URLs.';

create or replace function public.vault_external_storage_usage(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'activeBytes', coalesce(sum(byte_size) filter (where status = 'active'), 0)::bigint,
    'reservedBytes', coalesce(sum(byte_size) filter (where status in ('pending', 'deleting')), 0)::bigint,
    'effectiveBytes', coalesce(sum(byte_size) filter (where status in ('active', 'pending', 'deleting')), 0)::bigint
  )
  from public.storage_objects
  where user_id = target_user_id
    and provider in ('r2', 'b2')
    and deleted_at is null;
$$;

create or replace function public.vault_reserve_storage_object(
  target_user_id uuid,
  target_provider text,
  target_bucket text,
  target_object_key text,
  target_category text,
  reserved_byte_size bigint,
  target_mime_type text default null,
  target_checksum text default null,
  reservation_ttl_seconds integer default 3600
)
returns public.storage_objects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  quota_row public.user_storage_quotas%rowtype;
  settings public.quota_system_settings%rowtype;
  supabase_used bigint;
  external_effective bigint;
  result_row public.storage_objects%rowtype;
begin
  if target_user_id is null
    or target_provider not in ('r2', 'b2')
    or reserved_byte_size is null or reserved_byte_size <= 0
    or target_bucket is null or char_length(target_bucket) not between 1 and 255
    or target_object_key is null or char_length(target_object_key) not between 1 and 2048
    or target_object_key not like target_user_id::text || '/%'
    or target_category is null or char_length(target_category) not between 1 and 100
    or (target_mime_type is not null and char_length(target_mime_type) not between 1 and 255)
    or (target_checksum is not null and char_length(target_checksum) not between 1 and 512)
  then
    raise exception using errcode = '22023', message = 'INVALID_STORAGE_RESERVATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vault-quota:' || target_user_id::text, 0)
  );

  select * into settings
  from public.quota_system_settings
  where singleton;

  select * into quota_row
  from public.user_storage_quotas
  where user_id = target_user_id;

  if not coalesce(quota_row.storage_unlimited, false) then
    supabase_used := coalesce((public.vault_user_storage_usage(target_user_id) ->> 'usedBytes')::bigint, 0);
    external_effective := coalesce((public.vault_external_storage_usage(target_user_id) ->> 'effectiveBytes')::bigint, 0);

    if supabase_used + external_effective + reserved_byte_size
      > coalesce(quota_row.storage_quota_bytes, settings.default_storage_limit_bytes, 524288000)
    then
      raise exception using errcode = 'P0001', message = 'quota_exceeded:storage';
    end if;
  end if;

  insert into public.storage_objects (
    user_id, provider, bucket, object_key, category, byte_size,
    mime_type, checksum, status, reservation_expires_at
  ) values (
    target_user_id, target_provider, target_bucket, target_object_key, target_category,
    reserved_byte_size, target_mime_type, target_checksum, 'pending',
    now() + make_interval(secs => least(greatest(coalesce(reservation_ttl_seconds, 3600), 600), 86400))
  )
  returning * into result_row;

  return result_row;
end;
$$;

create or replace function public.vault_activate_storage_object(
  target_id uuid,
  target_user_id uuid,
  actual_byte_size bigint,
  target_mime_type text default null,
  target_checksum text default null
)
returns public.storage_objects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  pending_row public.storage_objects%rowtype;
  result_row public.storage_objects%rowtype;
begin
  if actual_byte_size is null or actual_byte_size < 0 then
    raise exception using errcode = '22023', message = 'INVALID_STORAGE_OBJECT_SIZE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vault-quota:' || target_user_id::text, 0)
  );

  select * into pending_row
  from public.storage_objects
  where id = target_id
    and user_id = target_user_id
    and status = 'pending'
    and deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PENDING_STORAGE_OBJECT_NOT_FOUND';
  end if;

  if pending_row.byte_size is null or actual_byte_size > pending_row.byte_size then
    raise exception using errcode = 'P0001', message = 'STORAGE_RESERVATION_SIZE_EXCEEDED';
  end if;

  update public.storage_objects
  set byte_size = actual_byte_size,
      mime_type = target_mime_type,
      checksum = target_checksum,
      status = 'active',
      reservation_expires_at = null,
      cleanup_claimed_at = null,
      cleanup_last_error = null,
      deleted_at = null
  where id = target_id
  returning * into result_row;

  return result_row;
end;
$$;

create or replace function public.vault_claim_expired_storage_objects(batch_size integer default 25)
returns setof public.storage_objects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with candidates as (
    select id
    from public.storage_objects
    where deleted_at is null
      and (
        (status = 'pending' and reservation_expires_at is not null and reservation_expires_at <= now())
        or (status = 'deleting' and cleanup_claimed_at <= now() - interval '15 minutes')
      )
      and provider in ('r2', 'b2')
    order by reservation_expires_at, created_at
    for update skip locked
    limit least(greatest(coalesce(batch_size, 25), 1), 100)
  )
  update public.storage_objects objects
  set status = 'deleting',
      cleanup_claimed_at = now(),
      cleanup_attempts = objects.cleanup_attempts + 1,
      cleanup_last_error = null
  from candidates
  where objects.id = candidates.id
  returning objects.*;
end;
$$;

create or replace function public.vault_finish_storage_cleanup(
  target_id uuid,
  deletion_succeeded boolean,
  failure_reason text default null
)
returns public.storage_objects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed_row public.storage_objects%rowtype;
  result_row public.storage_objects%rowtype;
  retry_minutes integer;
begin
  select * into claimed_row
  from public.storage_objects
  where id = target_id and status = 'deleting' and deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CLEANUP_CLAIM_NOT_FOUND';
  end if;

  if deletion_succeeded then
    update public.storage_objects
    set status = 'failed',
        deleted_at = now(),
        reservation_expires_at = null,
        cleanup_claimed_at = null,
        cleanup_last_error = null
    where id = target_id
    returning * into result_row;
  else
    retry_minutes := least(60, greatest(1, power(2, least(claimed_row.cleanup_attempts, 10))::integer));
    update public.storage_objects
    set status = 'pending',
        reservation_expires_at = now() + make_interval(mins => retry_minutes),
        cleanup_claimed_at = null,
        cleanup_last_error = left(coalesce(nullif(failure_reason, ''), 'Provider cleanup failed.'), 2000)
    where id = target_id
    returning * into result_row;
  end if;

  return result_row;
end;
$$;

-- Existing Supabase Storage uploads share the same account lock and include
-- external active/reserved bytes, so mixed-provider concurrent uploads cannot
-- exceed the logical account quota.
create or replace function public.vault_enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account_id uuid;
  quota_bytes bigint;
  is_unlimited boolean;
  supabase_used bigint;
  external_effective bigint;
  growth_bytes bigint;
begin
  if new.name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/' then
    return new;
  end if;

  account_id := split_part(new.name, '/', 1)::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vault-quota:' || account_id::text, 0)
  );

  growth_bytes := greatest(
    coalesce((new.metadata ->> 'size')::bigint, 0)
      - case when tg_op = 'UPDATE' then coalesce((old.metadata ->> 'size')::bigint, 0) else 0 end,
    0
  );
  if growth_bytes = 0 then return new; end if;

  select storage_quota_bytes, storage_unlimited
  into quota_bytes, is_unlimited
  from public.user_storage_quotas
  where user_id = account_id;

  if coalesce(is_unlimited, false) then return new; end if;
  if quota_bytes is null then
    select default_storage_limit_bytes into quota_bytes
    from public.quota_system_settings where singleton;
  end if;

  supabase_used := coalesce((public.vault_user_storage_usage(account_id) ->> 'usedBytes')::bigint, 0);
  external_effective := coalesce((public.vault_external_storage_usage(account_id) ->> 'effectiveBytes')::bigint, 0);

  if supabase_used + external_effective + growth_bytes > coalesce(quota_bytes, 524288000) then
    raise exception using errcode = 'P0001', message = 'quota_exceeded:storage';
  end if;

  return new;
end;
$$;

revoke all on function public.vault_external_storage_usage(uuid) from public, anon, authenticated;
revoke all on function public.vault_reserve_storage_object(uuid, text, text, text, text, bigint, text, text, integer) from public, anon, authenticated;
revoke all on function public.vault_activate_storage_object(uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.vault_claim_expired_storage_objects(integer) from public, anon, authenticated;
revoke all on function public.vault_finish_storage_cleanup(uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.vault_external_storage_usage(uuid) to service_role;
grant execute on function public.vault_reserve_storage_object(uuid, text, text, text, text, bigint, text, text, integer) to service_role;
grant execute on function public.vault_activate_storage_object(uuid, uuid, bigint, text, text) to service_role;
grant execute on function public.vault_claim_expired_storage_objects(integer) to service_role;
grant execute on function public.vault_finish_storage_cleanup(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
