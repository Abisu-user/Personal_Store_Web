-- Read-only shared catalog. A row is only copied into vocabulary_cards after a
-- user explicitly favorites it or adds it to their learning queue.
create table if not exists public.system_vocabulary (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('ja', 'en')),
  collection text not null check (collection in ('jlpt_common', 'toeic_common')),
  word text not null check (char_length(btrim(word)) between 1 and 300),
  reading text,
  kana text,
  romaji text,
  ipa text,
  meaning_zh_tw text not null,
  english_definition text,
  part_of_speech text,
  jlpt_level text check (jlpt_level is null or jlpt_level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  topics text[] not null default '{}'::text[],
  frequency_rank integer,
  importance smallint not null default 3 check (importance between 1 and 5),
  sort_key text not null,
  examples jsonb not null default '[]'::jsonb,
  source text not null default 'Personal Vault curated starter set',
  license text not null default 'Original curated metadata',
  dataset_version text not null default 'pv-starter-v1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_vocabulary_unique_entry_idx
  on public.system_vocabulary(language, collection, word, coalesce(reading, ''));
create index if not exists system_vocabulary_browse_idx
  on public.system_vocabulary(language, collection, jlpt_level, sort_key) where is_active;
create index if not exists system_vocabulary_topics_idx
  on public.system_vocabulary using gin(topics);

alter table public.system_vocabulary enable row level security;
revoke all on table public.system_vocabulary from anon, authenticated;

alter table public.vocabulary_cards
  add column if not exists system_word_id uuid references public.system_vocabulary(id) on delete set null,
  add column if not exists source_kind text not null default 'custom' check (source_kind in ('custom', 'catalog'));

create unique index if not exists vocabulary_cards_user_system_word_idx
  on public.vocabulary_cards(user_id, system_word_id)
  where system_word_id is not null and deleted_at is null;

-- Starter data is intentionally marked as a curated common-word collection,
-- not an official JLPT/TOEIC list. It can be expanded safely by later imports.
insert into public.system_vocabulary (language, collection, word, reading, kana, romaji, ipa, meaning_zh_tw, english_definition, part_of_speech, jlpt_level, topics, frequency_rank, importance, sort_key)
values
  ('ja','jlpt_common','会う','あう','あう','au',null,'見面、遇見','to meet','動詞','N5',array['日常','人際'],1,5,'あう'),
  ('ja','jlpt_common','青い','あおい','あおい','aoi',null,'藍色的','blue','形容詞','N5',array['顏色'],2,3,'あおい'),
  ('ja','jlpt_common','赤い','あかい','あかい','akai',null,'紅色的','red','形容詞','N5',array['顏色'],3,3,'あかい'),
  ('ja','jlpt_common','明るい','あかるい','あかるい','akarui',null,'明亮的；開朗的','bright; cheerful','形容詞','N5',array['日常'],4,3,'あかるい'),
  ('ja','jlpt_common','朝','あさ','あさ','asa',null,'早晨','morning','名詞','N5',array['時間'],5,4,'あさ'),
  ('ja','jlpt_common','新しい','あたらしい','あたらしい','atarashii',null,'新的','new','形容詞','N5',array['日常'],6,4,'あたらしい'),
  ('ja','jlpt_common','与える','あたえる','あたえる','ataeru',null,'給予；造成','to give; to cause','動詞','N3',array['抽象','動詞'],7,4,'あたえる'),
  ('ja','jlpt_common','歩く','あるく','あるく','aruku',null,'走路','to walk','動詞','N5',array['動作'],8,4,'あるく'),
  ('ja','jlpt_common','家','いえ','いえ','ie',null,'房子；家','house; home','名詞','N5',array['家庭'],9,4,'いえ'),
  ('ja','jlpt_common','行く','いく','いく','iku',null,'去','to go','動詞','N5',array['移動'],10,5,'いく'),
  ('ja','jlpt_common','忙しい','いそがしい','いそがしい','isogashii',null,'忙碌的','busy','形容詞','N5',array['日常'],11,4,'いそがしい'),
  ('ja','jlpt_common','犬','いぬ','いぬ','inu',null,'狗','dog','名詞','N5',array['動物'],12,3,'いぬ'),
  ('ja','jlpt_common','今','いま','いま','ima',null,'現在','now','名詞','N5',array['時間'],13,5,'いま'),
  ('ja','jlpt_common','意味','いみ','いみ','imi',null,'意思；意義','meaning','名詞','N4',array['抽象'],14,4,'いみ'),
  ('ja','jlpt_common','上','うえ','うえ','ue',null,'上面','above','名詞','N5',array['位置'],15,3,'うえ'),
  ('ja','jlpt_common','生まれる','うまれる','うまれる','umareru',null,'出生；產生','to be born','動詞','N4',array['生命'],16,3,'うまれる'),
  ('ja','jlpt_common','映画','えいが','えいが','eiga',null,'電影','movie','名詞','N5',array['娛樂'],17,3,'えいが'),
  ('ja','jlpt_common','駅','えき','えき','eki',null,'車站','station','名詞','N5',array['交通'],18,4,'えき'),
  ('ja','jlpt_common','大きい','おおきい','おおきい','ookii',null,'大的','big','形容詞','N5',array['日常'],19,4,'おおきい'),
  ('ja','jlpt_common','思う','おもう','おもう','omou',null,'想；認為','to think','動詞','N5',array['思考'],20,5,'おもう'),
  ('ja','jlpt_common','会社','かいしゃ','かいしゃ','kaisha',null,'公司','company','名詞','N5',array['工作'],21,4,'かいしゃ'),
  ('ja','jlpt_common','書く','かく','かく','kaku',null,'寫','to write','動詞','N5',array['動作'],22,4,'かく'),
  ('ja','jlpt_common','学校','がっこう','がっこう','gakkou',null,'學校','school','名詞','N5',array['教育'],23,4,'がっこう'),
  ('ja','jlpt_common','聞く','きく','きく','kiku',null,'聽；問','to hear; ask','動詞','N5',array['溝通'],24,5,'きく'),
  ('ja','jlpt_common','今日','きょう','きょう','kyou',null,'今天','today','名詞','N5',array['時間'],25,5,'きょう'),
  ('ja','jlpt_common','好き','すき','すき','suki',null,'喜歡','to like','形容詞','N5',array['感情'],26,5,'すき'),
  ('ja','jlpt_common','少し','すこし','すこし','sukoshi',null,'一點；稍微','a little','副詞','N5',array['數量'],27,4,'すこし'),
  ('ja','jlpt_common','食べる','たべる','たべる','taberu',null,'吃','to eat','動詞','N5',array['飲食'],28,5,'たべる'),
  ('ja','jlpt_common','楽しい','たのしい','たのしい','tanoshii',null,'愉快的','fun','形容詞','N5',array['感情'],29,4,'たのしい'),
  ('ja','jlpt_common','小さい','ちいさい','ちいさい','chiisai',null,'小的','small','形容詞','N5',array['日常'],30,4,'ちいさい'),
  ('ja','jlpt_common','作る','つくる','つくる','tsukuru',null,'製作；創造','to make','動詞','N5',array['動作'],31,4,'つくる'),
  ('ja','jlpt_common','手','て','て','te',null,'手','hand','名詞','N5',array['身體'],32,4,'て'),
  ('ja','jlpt_common','友達','ともだち','ともだち','tomodachi',null,'朋友','friend','名詞','N5',array['人際'],33,5,'ともだち'),
  ('ja','jlpt_common','飲む','のむ','のむ','nomu',null,'喝','to drink','動詞','N5',array['飲食'],34,4,'のむ'),
  ('ja','jlpt_common','話す','はなす','はなす','hanasu',null,'說話','to speak','動詞','N5',array['溝通'],35,5,'はなす'),
  ('ja','jlpt_common','人','ひと','ひと','hito',null,'人','person','名詞','N5',array['人際'],36,5,'ひと'),
  ('ja','jlpt_common','勉強','べんきょう','べんきょう','benkyou',null,'學習；用功','study','名詞','N5',array['教育'],37,4,'べんきょう'),
  ('ja','jlpt_common','本','ほん','ほん','hon',null,'書；本','book','名詞','N5',array['教育'],38,4,'ほん'),
  ('ja','jlpt_common','見る','みる','みる','miru',null,'看','to see','動詞','N5',array['感官'],39,5,'みる'),
  ('ja','jlpt_common','難しい','むずかしい','むずかしい','muzukashii',null,'困難的','difficult','形容詞','N5',array['學習'],40,4,'むずかしい'),
  ('ja','jlpt_common','問題','もんだい','もんだい','mondai',null,'問題','problem','名詞','N4',array['學習'],41,4,'もんだい'),
  ('ja','jlpt_common','約束','やくそく','やくそく','yakusoku',null,'約定；承諾','promise','名詞','N4',array['人際'],42,3,'やくそく'),
  ('ja','jlpt_common','読む','よむ','よむ','yomu',null,'閱讀','to read','動詞','N5',array['教育'],43,5,'よむ'),
  ('ja','jlpt_common','旅行','りょこう','りょこう','ryokou',null,'旅行','travel','名詞','N5',array['旅遊'],44,4,'りょこう'),
  ('ja','jlpt_common','分かる','わかる','わかる','wakaru',null,'理解；明白','to understand','動詞','N5',array['學習'],45,5,'わかる'),
  ('en','toeic_common','ability',null,null,'ability','əˈbɪləti','能力','the power or skill to do something','noun',null,array['職場','能力'],1,4,'ability'),
  ('en','toeic_common','achieve',null,null,'achieve','əˈtʃiːv','達成','to successfully complete a goal','verb',null,array['職場','目標'],2,4,'achieve'),
  ('en','toeic_common','available',null,null,'available','əˈveɪləbəl','可取得的；有空的','able to be used or obtained','adjective',null,array['職場'],3,4,'available'),
  ('en','toeic_common','benefit',null,null,'benefit','ˈbenɪfɪt','利益；使受益','an advantage; to help','noun / verb',null,array['商務'],4,4,'benefit'),
  ('en','toeic_common','budget',null,null,'budget','ˈbʌdʒɪt','預算','a financial plan','noun',null,array['商務','財務'],5,4,'budget'),
  ('en','toeic_common','customer',null,null,'customer','ˈkʌstəmər','顧客','a person who buys goods or services','noun',null,array['商務'],6,4,'customer'),
  ('en','toeic_common','deadline',null,null,'deadline','ˈdedlaɪn','截止期限','the latest time for completing something','noun',null,array['職場','時間'],7,5,'deadline'),
  ('en','toeic_common','deliver',null,null,'deliver','dɪˈlɪvər','遞送；交付','to take something to a person or place','verb',null,array['物流','職場'],8,4,'deliver'),
  ('en','toeic_common','employee',null,null,'employee','ɪmˈplɔɪiː','員工','a person employed by a company','noun',null,array['職場'],9,4,'employee'),
  ('en','toeic_common','estimate',null,null,'estimate','ˈestɪmeɪt','估計；估價','an approximate calculation','noun / verb',null,array['商務'],10,4,'estimate'),
  ('en','toeic_common','facility',null,null,'facility','fəˈsɪləti','設施','a building or equipment for a purpose','noun',null,array['職場'],11,3,'facility'),
  ('en','toeic_common','improve',null,null,'improve','ɪmˈpruːv','改善','to make better','verb',null,array['職場'],12,5,'improve'),
  ('en','toeic_common','maintain',null,null,'maintain','meɪnˈteɪn','維持；保養','to keep in good condition','verb',null,array['職場'],13,5,'maintain'),
  ('en','toeic_common','meeting',null,null,'meeting','ˈmiːtɪŋ','會議','a gathering for discussion','noun',null,array['職場'],14,5,'meeting'),
  ('en','toeic_common','negotiate',null,null,'negotiate','nɪˈɡoʊʃieɪt','談判','to discuss to reach agreement','verb',null,array['商務'],15,3,'negotiate'),
  ('en','toeic_common','opportunity',null,null,'opportunity','ˌɑːpərˈtuːnəti','機會','a favorable situation','noun',null,array['職場'],16,5,'opportunity'),
  ('en','toeic_common','purchase',null,null,'purchase','ˈpɜːrtʃəs','購買；採購','to buy','noun / verb',null,array['商務'],17,4,'purchase'),
  ('en','toeic_common','receive',null,null,'receive','rɪˈsiːv','收到','to get something','verb',null,array['職場'],18,4,'receive'),
  ('en','toeic_common','schedule',null,null,'schedule','ˈskedʒuːl','行程；排程','a plan of times','noun',null,array['職場','時間'],19,4,'schedule'),
  ('en','toeic_common','service',null,null,'service','ˈsɜːrvɪs','服務','work done to help customers','noun',null,array['商務'],20,4,'service'),
  ('en','toeic_common','strategy',null,null,'strategy','ˈstrætədʒi','策略','a plan for success','noun',null,array['商務'],21,3,'strategy'),
  ('en','toeic_common','support',null,null,'support','səˈpɔːrt','支持；支援','to help','noun / verb',null,array['職場'],22,4,'support'),
  ('en','toeic_common','training',null,null,'training','ˈtreɪnɪŋ','訓練','the process of learning skills','noun',null,array['職場','教育'],23,4,'training'),
  ('en','toeic_common','update',null,null,'update','ʌpˈdeɪt','更新','to make current','noun / verb',null,array['職場'],24,4,'update'),
  ('en','toeic_common','valuable',null,null,'valuable','ˈvæljuəbəl','有價值的','worth a lot','adjective',null,array['商務'],25,3,'valuable'),
  ('en','toeic_common','warehouse',null,null,'warehouse','ˈwerhaʊs','倉庫','a building for storing goods','noun',null,array['物流'],26,3,'warehouse');

drop trigger if exists vault_app_system_vocabulary_updated_at on public.system_vocabulary;
create trigger vault_app_system_vocabulary_updated_at before update on public.system_vocabulary
for each row execute procedure public.vault_app_set_updated_at();
