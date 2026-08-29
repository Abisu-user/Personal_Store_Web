-- Source-backed catalog entries are identified by the stable source pair.
-- The original expression index prevented a source upsert whenever one of
-- the earlier starter words had the same visible spelling/reading.
drop index if exists public.system_vocabulary_unique_entry_idx;

-- Keep the earlier safeguard for only the legacy (source-less) starter rows,
-- while allowing a canonical source entry to replace its metadata safely.
create unique index if not exists system_vocabulary_legacy_unique_entry_idx
  on public.system_vocabulary(language, collection, word, coalesce(reading, ''))
  where source_id is null;
