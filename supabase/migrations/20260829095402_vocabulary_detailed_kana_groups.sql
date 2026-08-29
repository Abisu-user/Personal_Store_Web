-- Reclassify the existing OpenJLPT collection from ten broad rows to the
-- individual sounds shown by the full gojūon filter in Vocabulary.
-- Small and voiced kana belong to their base sound (が → か, きゃ → き).

with source_rows as (
  select d.id, left(coalesce(nullif(d.normalized_reading, ''), nullif(d.reading, ''), d.word), 1) as initial
  from public.dictionary_entries d
  join public.dictionary_sources s on s.id = d.source_id
  where s.slug = 'openjlpt'
), classified as (
  select id,
    case
      when initial = any (array['あ', 'ぁ']) then 'あ' when initial = any (array['い', 'ぃ']) then 'い' when initial = any (array['う', 'ぅ', 'ゔ']) then 'う' when initial = any (array['え', 'ぇ']) then 'え' when initial = any (array['お', 'ぉ']) then 'お'
      when initial = any (array['か', 'が']) then 'か' when initial = any (array['き', 'ぎ']) then 'き' when initial = any (array['く', 'ぐ']) then 'く' when initial = any (array['け', 'げ']) then 'け' when initial = any (array['こ', 'ご']) then 'こ'
      when initial = any (array['さ', 'ざ']) then 'さ' when initial = any (array['し', 'じ']) then 'し' when initial = any (array['す', 'ず']) then 'す' when initial = any (array['せ', 'ぜ']) then 'せ' when initial = any (array['そ', 'ぞ']) then 'そ'
      when initial = any (array['た', 'だ']) then 'た' when initial = any (array['ち', 'ぢ']) then 'ち' when initial = any (array['つ', 'づ']) then 'つ' when initial = any (array['て', 'で']) then 'て' when initial = any (array['と', 'ど']) then 'と'
      when initial = 'な' then 'な' when initial = 'に' then 'に' when initial = 'ぬ' then 'ぬ' when initial = 'ね' then 'ね' when initial = 'の' then 'の'
      when initial = any (array['は', 'ば', 'ぱ']) then 'は' when initial = any (array['ひ', 'び', 'ぴ']) then 'ひ' when initial = any (array['ふ', 'ぶ', 'ぷ']) then 'ふ' when initial = any (array['へ', 'べ', 'ぺ']) then 'へ' when initial = any (array['ほ', 'ぼ', 'ぽ']) then 'ほ'
      when initial = 'ま' then 'ま' when initial = 'み' then 'み' when initial = 'む' then 'む' when initial = 'め' then 'め' when initial = 'も' then 'も'
      when initial = any (array['や', 'ゃ']) then 'や' when initial = any (array['ゆ', 'ゅ']) then 'ゆ' when initial = any (array['よ', 'ょ']) then 'よ'
      when initial = 'ら' then 'ら' when initial = 'り' then 'り' when initial = 'る' then 'る' when initial = 'れ' then 'れ' when initial = 'ろ' then 'ろ'
      when initial = any (array['わ', 'ゐ', 'ゑ']) then 'わ' when initial = 'を' then 'を' when initial = 'ん' then 'ん'
      else '其他'
    end as kana_group
  from source_rows
)
update public.vocabulary_collection_entries mapping
set kana_group = classified.kana_group,
    updated_at = now()
from classified
where mapping.dictionary_entry_id = classified.id;

-- Use the updated collection mapping as the source of truth for the public
-- browse table too, keeping both representations consistent.
update public.system_vocabulary catalog
set kana_group = mapping.kana_group,
    updated_at = now()
from public.vocabulary_collection_entries mapping
join public.vocabulary_collections collection on collection.id = mapping.collection_id
where collection.slug = 'jlpt_common'
  and catalog.dictionary_entry_id = mapping.dictionary_entry_id
  and catalog.language = 'ja'
  and catalog.collection = 'jlpt_common';
