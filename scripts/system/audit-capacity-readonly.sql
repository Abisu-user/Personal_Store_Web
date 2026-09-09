-- Phase 0 / Phase 13 read-only capacity audit. NOT a schema migration.
-- Supabase Dashboard > Personal_Store_Web > SQL Editor > New query > Run.
-- Returns only counts/sizes, not row contents, emails, keys or object paths.
-- Run the whole file. No tables/functions are created; no data is changed.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '3s';

WITH relations AS MATERIALIZED (
  SELECT c.oid, n.nspname, c.relname,
    pg_table_size(c.oid) AS table_bytes,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_total_relation_size(c.oid) AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'm')
), measured AS MATERIALIZED (
  SELECT r.*, x.row_count, x.logical_bytes
  FROM relations r
  CROSS JOIN LATERAL XMLTABLE(
    '/table/row'
    PASSING query_to_xml(format(
      'SELECT count(*) AS row_count, coalesce(sum(pg_column_size(t)),0) AS logical_bytes FROM %I.%I t',
      r.nspname, r.relname
    ), false, false, '')
    COLUMNS row_count bigint PATH 'row_count', logical_bytes bigint PATH 'logical_bytes'
  ) x
), objects AS MATERIALIZED (
  SELECT bucket_id,
    CASE
      WHEN bucket_id = 'vault-files' AND name LIKE '%/photos/%' THEN 'photos'
      WHEN bucket_id = 'vault-files' THEN 'files / attachments'
      WHEN bucket_id = 'content-covers' THEN 'content-covers'
      WHEN bucket_id = 'workspace-backgrounds' THEN 'workspace-backgrounds/' || split_part(name, '/', 2)
      ELSE 'other'
    END AS category,
    CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END AS bytes,
    CASE WHEN coalesce(metadata->>'size', '') ~ '^[0-9]+$' THEN 0 ELSE 1 END AS missing_size
  FROM storage.objects
), storage_groups AS (
  SELECT bucket_id, category, count(*) AS object_count, sum(bytes) AS used_bytes,
    sum(missing_size) AS missing_size_count
  FROM objects GROUP BY bucket_id, category
), example_groups AS (
  SELECT CASE WHEN card_id IS NULL THEN 'system_shared' ELSE 'user' END AS ownership,
    example_kind, count(*) AS row_count, coalesce(sum(pg_column_size(e)), 0) AS logical_bytes
  FROM public.vocabulary_examples e GROUP BY 1, 2
), capacities AS MATERIALIZED (
  SELECT public.vault_user_capacity(id) AS value FROM public.profiles
)
SELECT jsonb_build_object(
  'collected_at', now(),
  'measurement', 'logical=sum(pg_column_size(row)); table=pg_table_size; index=pg_indexes_size; total=pg_total_relation_size; all sizes in bytes',
  'database_bytes', pg_database_size(current_database()),
  'public_totals', (SELECT jsonb_build_object(
    'table_count', count(*), 'logical_bytes', coalesce(sum(logical_bytes), 0),
    'table_bytes', coalesce(sum(table_bytes), 0), 'index_bytes', coalesce(sum(index_bytes), 0),
    'total_bytes', coalesce(sum(total_bytes), 0)
  ) FROM measured),
  'tables', (SELECT jsonb_agg(jsonb_build_object(
    'table', relname, 'rows', row_count, 'logical_bytes', logical_bytes,
    'table_bytes', table_bytes, 'index_bytes', index_bytes, 'total_bytes', total_bytes
  ) ORDER BY total_bytes DESC, relname) FROM measured),
  'storage', jsonb_build_object(
    'object_count', (SELECT count(*) FROM objects),
    'used_bytes', (SELECT coalesce(sum(bytes), 0) FROM objects),
    'missing_size_count', (SELECT coalesce(sum(missing_size), 0) FROM objects),
    'groups', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY used_bytes DESC), '[]'::jsonb) FROM storage_groups g),
    'buckets', (SELECT jsonb_agg(jsonb_build_object(
      'bucket', b.id, 'private', NOT b.public,
      'object_count', (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id)
    ) ORDER BY b.id) FROM storage.buckets b)
  ),
  'examples', (SELECT jsonb_agg(to_jsonb(e)) FROM example_groups e),
  'user_quota_totals', (SELECT jsonb_build_object(
    'accounts', count(*),
    'database_bytes', coalesce(sum((value->>'databaseUsedBytes')::bigint), 0),
    'storage_bytes', coalesce(sum((value->>'storageUsedBytes')::bigint), 0)
  ) FROM capacities),
  'checks', jsonb_build_object(
    'all_tables_measured', (SELECT count(*) FROM measured) = (SELECT count(*) FROM relations),
    'physical_parts_match', (SELECT coalesce(bool_and(table_bytes + index_bytes = total_bytes), true) FROM measured),
    'no_missing_storage_sizes', (SELECT coalesce(sum(missing_size), 0) = 0 FROM objects),
    'personal_storage_matches_project', (SELECT coalesce(sum((value->>'storageUsedBytes')::bigint), 0) FROM capacities) = (SELECT coalesce(sum(bytes), 0) FROM objects)
  )
) AS capacity_audit;

COMMIT;
-- If a statement times out, execute ROLLBACK; before retrying in the same session.
-- A false personal_storage_matches_project may legitimately indicate system-owned
-- objects; inspect ownership instead of deleting objects or changing quotas.
