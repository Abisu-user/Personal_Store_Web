-- Read-only verification for 20260909120000_allow_b2_storage_provider.sql.
-- Expected: provider_constraint_exists=true, provider_constraint_valid=true,
-- allows_b2=true, b2_rows=0 before Phase 4 application code is exercised.

select
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.storage_objects'::regclass
      and conname = 'storage_objects_provider_check'
  ) as provider_constraint_exists,
  coalesce((
    select convalidated
    from pg_constraint
    where conrelid = 'public.storage_objects'::regclass
      and conname = 'storage_objects_provider_check'
  ), false) as provider_constraint_valid,
  coalesce((
    select pg_get_constraintdef(oid) like '%b2%'
    from pg_constraint
    where conrelid = 'public.storage_objects'::regclass
      and conname = 'storage_objects_provider_check'
  ), false) as allows_b2,
  (select count(*) from public.storage_objects where provider = 'b2') as b2_rows;
