-- System / user / AI examples are deliberately stored in one table, but are
-- distinguishable by example_kind. Existing user examples remain untouched.
alter table public.vocabulary_examples
  alter column card_id drop not null,
  add column if not exists dictionary_entry_id uuid references public.dictionary_entries(id) on delete cascade,
  add column if not exists sense_id text,
  add column if not exists language text,
  add column if not exists translation_zh_tw text,
  add column if not exists difficulty_level text,
  add column if not exists source_id text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists example_kind text not null default 'user',
  add column if not exists updated_at timestamptz not null default now();

alter table public.vocabulary_examples drop constraint if exists vocabulary_examples_example_kind_check;
alter table public.vocabulary_examples add constraint vocabulary_examples_example_kind_check check (example_kind in ('system', 'user', 'ai'));
alter table public.vocabulary_examples drop constraint if exists vocabulary_examples_difficulty_level_check;
alter table public.vocabulary_examples add constraint vocabulary_examples_difficulty_level_check check (difficulty_level is null or difficulty_level in ('N5','N4','N3','N2','N1','A1','A2','B1','B2','C1','C2','unknown'));
alter table public.vocabulary_examples drop constraint if exists vocabulary_examples_origin_shape_check;
alter table public.vocabulary_examples add constraint vocabulary_examples_origin_shape_check check (
  (example_kind = 'system' and card_id is null and dictionary_entry_id is not null)
  or (example_kind in ('user', 'ai') and card_id is not null)
);

update public.vocabulary_examples examples
set language = coalesce(examples.language, cards.language),
    translation_zh_tw = coalesce(examples.translation_zh_tw, examples.translation),
    example_kind = coalesce(nullif(examples.example_kind, ''), 'user')
from public.vocabulary_cards cards
where examples.card_id = cards.id;

create index if not exists vocabulary_examples_dictionary_entry_idx on public.vocabulary_examples(dictionary_entry_id, sense_id, created_at desc) where card_id is null;
create unique index if not exists vocabulary_examples_system_unique_idx on public.vocabulary_examples(dictionary_entry_id, sense_id, sentence) where card_id is null;

alter table public.vocabulary_examples enable row level security;
revoke all on public.vocabulary_examples from anon, authenticated;

-- Curated examples are manually reviewed examples. They intentionally cover
-- distinct senses so learners do not confuse 遭う with 会う, for example.
with seed(word, reading, sense_id, sentence, sentence_reading, zh_tw, difficulty) as (
  values
    ('相変わらず','あいかわらず','0','彼は相変わらず元気です。','かれは あいかわらず げんきです。','他還是一樣很有精神。','N4'),
    ('相変わらず','あいかわらず','0','この店は相変わらず人気がある。','このみせは あいかわらず にんきがある。','這家店依舊很受歡迎。','N3'),
    ('与える','あたえる','0','先生は学生にチャンスを与えた。','せんせいは がくせいに チャンスを あたえた。','老師給了學生機會。','N3'),
    ('与える','あたえる','1','この経験は私に大きな影響を与えた。','このけいけんは わたしに おおきな えいきょうを あたえた。','這次經驗對我造成了很大的影響。','N2'),
    ('与える','あたえる','2','薬が体に刺激を与えることがある。','くすりが からだに しげきを あたえることがある。','藥物有時會對身體造成刺激。','N2'),
    ('遭う','あう','0','彼は帰宅途中に事故に遭った。','かれは きたくとちゅうに じこに あった。','他在回家的途中遇到了事故。','N3'),
    ('遭う','あう','0','旅行中に大雨に遭った。','りょこうちゅうに おおあめに あった。','旅行途中碰上了大雨。','N3'),
    ('挙げる','あげる','0','手を挙げて質問した。','てを あげて しつもんした。','我舉手發問。','N5'),
    ('挙げる','あげる','1','例を三つ挙げてください。','れいを みっつ あげてください。','請舉出三個例子。','N4'),
    ('挙げる','あげる','2','二人は来月、結婚式を挙げる。','ふたりは らいげつ、けっこんしきを あげる。','兩人下個月要舉行婚禮。','N3'),
    ('挙げる','あげる','3','そのチームは大きな成果を挙げた。','そのチームは おおきな せいかを あげた。','那個團隊取得了重大成果。','N2'),
    ('暴れる','あばれる','0','子どもが店の中で暴れている。','こどもが みせのなかで あばれている。','孩子正在店裡大鬧。','N3'),
    ('暴れる','あばれる','0','犬が急に暴れ出した。','いぬが きゅうに あばれだした。','狗突然開始亂竄掙扎。','N3'),
    ('あふれる','あふれる','0','会場は人であふれていた。','かいじょうは ひとで あふれていた。','會場裡擠滿了人。','N3'),
    ('あふれる','あふれる','1','彼女の顔には喜びがあふれていた。','かのじょの かおには よろこびが あふれていた。','她的臉上洋溢著喜悅。','N2'),
    ('当たり前','あたりまえ','0','そんなの当たり前だ。','そんなの あたりまえだ。','那是理所當然的。','N4'),
    ('当たり前','あたりまえ','0','毎日練習すれば上達するのは当たり前だ。','まいにち れんしゅうすれば じょうたつするのは あたりまえだ。','每天練習會進步是很正常的。','N3')
)
insert into public.vocabulary_examples (card_id, dictionary_entry_id, sense_id, language, sentence, reading, translation, translation_zh_tw, difficulty_level, source, source_id, is_verified, example_kind)
select null, entries.id, seed.sense_id, 'ja', seed.sentence, seed.sentence_reading, seed.zh_tw, seed.zh_tw, seed.difficulty, 'manual', 'pv-reviewed-v1', true, 'system'
from seed
join public.dictionary_entries entries on entries.language = 'ja' and entries.word = seed.word and coalesce(entries.reading, '') = seed.reading
on conflict (dictionary_entry_id, sense_id, sentence) where card_id is null do update set
  reading = excluded.reading, translation = excluded.translation, translation_zh_tw = excluded.translation_zh_tw,
  difficulty_level = excluded.difficulty_level, source = excluded.source, source_id = excluded.source_id,
  is_verified = true, updated_at = now();
