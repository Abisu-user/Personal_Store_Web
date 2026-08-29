-- Keep Japanese dictionary senses structured in the system catalogue.  A
-- flattened meaning list is useful for search, but it cannot represent which
-- Traditional Chinese meanings belong to the same JMdict sense.

alter table public.system_vocabulary
  add column if not exists translation_senses_zh_tw jsonb not null default '[]'::jsonb;

comment on column public.system_vocabulary.translation_senses_zh_tw is
  'Sense-aware Japanese dictionary data. Each item retains its own Traditional Chinese meanings and does not derive Chinese from English glosses.';

-- Supersedes the earlier batch updater with the additional structured field.
-- This stays server-only: no browser role can execute it.
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
      senses jsonb,
      translation_senses_zh_tw jsonb,
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
        'traditionalChineseTranslationSource', 'tomoshi-jmdict-zhtw',
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
      translation_senses_zh_tw = coalesce(patch.translation_senses_zh_tw, patch.senses, '[]'::jsonb),
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
