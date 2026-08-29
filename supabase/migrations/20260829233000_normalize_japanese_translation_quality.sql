-- Keep a compact learner-facing primary sense while preserving all other
-- verified senses for detail views.  This is additive and does not alter or
-- reset existing vocabulary data.
alter table public.system_vocabulary
  add column if not exists secondary_meanings_zh_tw jsonb not null default '[]'::jsonb,
  add column if not exists translation_metadata jsonb not null default '{}'::jsonb;

comment on column public.system_vocabulary.secondary_meanings_zh_tw is
  'Lower-priority verified Traditional Chinese meanings, retained for detail views and excluded from the catalogue card primary line.';

comment on column public.system_vocabulary.translation_metadata is
  'Translation provenance, confidence, primary-sense selection, and card display policy for Japanese system vocabulary.';

-- Extend the trusted server-only batch hydration RPC.  The caller provides
-- JSON generated from the Tomoshi/JMdict sense normalizer; no browser role
-- receives permission to invoke this function.
create or replace function public.apply_verified_japanese_translation_batch(p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  with patch as (
    select *
    from jsonb_to_recordset(p_updates) as value(
      dictionary_entry_id uuid,
      normalized_word text,
      primary_meaning text,
      meanings_json jsonb,
      secondary_meanings_json jsonb,
      senses jsonb,
      translation_senses_zh_tw jsonb,
      translation_metadata jsonb,
      english_definition text,
      part_of_speech text
    )
  ), translated as (
    insert into public.dictionary_translations (
      source_language, normalized_word, target_language, primary_meaning,
      meanings_json, source, verified, updated_at
    )
    select
      'ja', patch.normalized_word, 'zh-TW', patch.primary_meaning,
      patch.meanings_json, 'tomoshi-jmdict-zhtw', true, now()
    from patch
    on conflict (source_language, normalized_word, target_language) do update set
      primary_meaning = excluded.primary_meaning,
      meanings_json = excluded.meanings_json,
      source = excluded.source,
      verified = true,
      updated_at = now()
    returning normalized_word
  ), dictionary_updated as (
    update public.dictionary_entries entry
    set
      primary_translation = patch.primary_meaning,
      senses = patch.senses,
      english_definition = patch.english_definition,
      part_of_speech = patch.part_of_speech,
      source_metadata = coalesce(entry.source_metadata, '{}'::jsonb) || jsonb_build_object(
        'traditionalChineseTranslationSource', coalesce(patch.translation_metadata->>'source', 'tomoshi-jmdict-zhtw'),
        'traditionalChineseTranslationConfidence', coalesce(patch.translation_metadata->>'confidence', 'source-normalized'),
        'traditionalChineseVerified', true,
        'traditionalChineseUpdatedAt', now()
      ),
      updated_at = now()
    from patch
    where entry.id = patch.dictionary_entry_id
    returning entry.id
  ), catalog_updated as (
    update public.system_vocabulary catalog
    set
      meaning_zh_tw = patch.primary_meaning,
      meanings_zh_tw = patch.meanings_json,
      secondary_meanings_zh_tw = coalesce(patch.secondary_meanings_json, '[]'::jsonb),
      translation_senses_zh_tw = coalesce(patch.translation_senses_zh_tw, patch.senses, '[]'::jsonb),
      translation_metadata = coalesce(patch.translation_metadata, '{}'::jsonb),
      english_definition = patch.english_definition,
      part_of_speech = patch.part_of_speech,
      updated_at = now()
    from patch
    where catalog.dictionary_entry_id = patch.dictionary_entry_id
      and catalog.language = 'ja'
    returning catalog.id
  )
  select count(*) into affected_count from catalog_updated;

  return affected_count;
end;
$$;

revoke all on function public.apply_verified_japanese_translation_batch(jsonb) from public, anon, authenticated;
grant execute on function public.apply_verified_japanese_translation_batch(jsonb) to service_role;
