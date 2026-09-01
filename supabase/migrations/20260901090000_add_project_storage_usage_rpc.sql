-- Server-only project capacity reporting. The function is intentionally only
-- executable by service_role; the browser never receives database privileges.
create or replace function public.vault_project_storage_usage()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $function$
declare
  v_database_bytes bigint := null;
  v_storage_bytes bigint := null;
  v_system_heap_bytes bigint := 0;
  v_personal_heap_bytes bigint := 0;
  v_tables jsonb := '[]'::jsonb;
  v_storage_groups jsonb := '[]'::jsonb;
  v_database_error text := null;
  v_storage_error text := null;
begin
  begin
    select pg_database_size(current_database())::bigint into v_database_bytes;

    with relations as (
      select
        c.relname as name,
        pg_relation_size(c.oid)::bigint as data_bytes,
        pg_indexes_size(c.oid)::bigint as index_bytes,
        pg_total_relation_size(c.oid)::bigint as total_bytes,
        case
          when c.relname ~ '^(system_|dictionary_)'
            or c.relname in ('vocabulary_collections', 'vocabulary_collection_entries', 'vocabulary_dataset_imports', 'vocabulary_catalog_admins')
          then 'system'
          else 'personal'
        end as usage_group
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'm')
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', name,
      'group', usage_group,
      'dataBytes', data_bytes,
      'indexBytes', index_bytes,
      'otherBytes', greatest(total_bytes - data_bytes - index_bytes, 0),
      'totalBytes', total_bytes
    ) order by total_bytes desc), '[]'::jsonb),
    coalesce(sum(data_bytes) filter (where usage_group = 'system'), 0),
    coalesce(sum(data_bytes) filter (where usage_group = 'personal'), 0)
    into v_tables, v_system_heap_bytes, v_personal_heap_bytes
    from relations;
  exception when others then
    v_database_error := sqlerrm;
  end;

  begin
    with objects as (
      select
        case
          when bucket_id = 'vault-files' and name like '%/photos/%' then 'photos'
          when bucket_id = 'vault-files' then 'files'
          when bucket_id = 'content-covers' then 'content-covers'
          else bucket_id
        end as category,
        case
          when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$' then (metadata ->> 'size')::bigint
          else 0
        end as byte_size
      from storage.objects
    )
    select coalesce(sum(byte_size), 0),
      coalesce(jsonb_agg(jsonb_build_object('category', category, 'usedBytes', used_bytes) order by used_bytes desc), '[]'::jsonb)
    into v_storage_bytes, v_storage_groups
    from (
      select category, sum(byte_size)::bigint as used_bytes
      from objects
      group by category
    ) grouped;
  exception when others then
    v_storage_error := sqlerrm;
  end;

  return jsonb_build_object(
    'database', case when v_database_bytes is null then null else jsonb_build_object(
      'usedBytes', v_database_bytes,
      'systemHeapBytes', v_system_heap_bytes,
      'personalHeapBytes', v_personal_heap_bytes,
      'indexAndOtherBytes', greatest(v_database_bytes - v_system_heap_bytes - v_personal_heap_bytes, 0)
    ) end,
    'storage', case when v_storage_bytes is null then null else jsonb_build_object('usedBytes', v_storage_bytes) end,
    'tables', v_tables,
    'storageGroups', v_storage_groups,
    'errors', jsonb_strip_nulls(jsonb_build_object('database', v_database_error, 'storage', v_storage_error)),
    'collectedAt', now()
  );
end;
$function$;

revoke all on function public.vault_project_storage_usage() from public, anon, authenticated;
grant execute on function public.vault_project_storage_usage() to service_role;
