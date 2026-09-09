-- Read-only Phase 5 verification. Run after the migration in Supabase SQL Editor.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_objects'
      and column_name = 'reservation_expires_at'
  ) as has_reservation_expiry,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_objects'
      and column_name = 'cleanup_attempts'
  ) as has_cleanup_attempts,
  to_regprocedure('public.vault_reserve_storage_object(uuid,text,text,text,text,bigint,text,text,integer)') is not null
    as has_atomic_reservation_rpc,
  to_regprocedure('public.vault_activate_storage_object(uuid,uuid,bigint,text,text)') is not null
    as has_atomic_activation_rpc,
  to_regprocedure('public.vault_claim_expired_storage_objects(integer)') is not null
    as has_cleanup_claim_rpc,
  to_regprocedure('public.vault_finish_storage_cleanup(uuid,boolean,text)') is not null
    as has_cleanup_finish_rpc,
  count(*) filter (where status = 'pending') as pending_rows,
  coalesce(sum(byte_size) filter (where status in ('pending', 'deleting') and deleted_at is null), 0) as reserved_bytes
from public.storage_objects;
