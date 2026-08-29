-- Production dataset architecture for the shared Vocabulary Catalog.
-- User-owned vocabulary_cards remain untouched; source updates only replace
-- catalog metadata through stable external source identifiers.

create table if not exists public.dictionary_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]{2,80}$'),
  name text not null,
  source_url text not null,
  license text not null,
  attribution text not null,
  source_version text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.dictionary_sources(id) on delete restrict,
  source_entry_id text not null,
  language text not null check (language in ('ja', 'en')),
  word text not null check (char_length(btrim(word)) between 1 and 300),
  reading text,
  normalized_word text not null,
  normalized_reading text,
  primary_translation text,
  english_definition text,
  part_of_speech text,
  kanji_forms jsonb not null default '[]'::jsonb,
  reading_forms jsonb not null default '[]'::jsonb,
  senses jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_entry_id)
);

create table if not exists public.vocabulary_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]{2,80}$'),
  language text not null check (language in ('ja', 'en')),
  name text not null,
  description text,
  source_id uuid references public.dictionary_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vocabulary_collection_entries (
  collection_id uuid not null references public.vocabulary_collections(id) on delete cascade,
  dictionary_entry_id uuid not null references public.dictionary_entries(id) on delete cascade,
  level text,
  kana_group text,
  topics text[] not null default '{}'::text[],
  importance smallint not null default 3 check (importance between 1 and 5),
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection_id, dictionary_entry_id)
);

create table if not exists public.vocabulary_dataset_imports (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.dictionary_sources(id) on delete restrict,
  collection_id uuid references public.vocabulary_collections(id) on delete set null,
  dataset_version text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  item_counts jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  error_message text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_vocabulary
  add column if not exists source_id uuid references public.dictionary_sources(id) on delete set null,
  add column if not exists source_entry_id text,
  add column if not exists dictionary_entry_id uuid references public.dictionary_entries(id) on delete set null,
  add column if not exists normalized_word text,
  add column if not exists normalized_reading text,
  add column if not exists kana_group text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'system_vocabulary_source_entry_key') then
    alter table public.system_vocabulary add constraint system_vocabulary_source_entry_key unique (source_id, source_entry_id);
  end if;
end $$;

alter table public.vocabulary_cards
  add column if not exists dictionary_entry_id uuid references public.dictionary_entries(id) on delete set null;

create index if not exists dictionary_entries_browse_idx
  on public.dictionary_entries(language, normalized_word, normalized_reading);
create index if not exists vocabulary_collection_entries_browse_idx
  on public.vocabulary_collection_entries(collection_id, level, kana_group, sort_order);
create index if not exists vocabulary_collection_entries_topics_idx
  on public.vocabulary_collection_entries using gin(topics);
create index if not exists vocabulary_dataset_imports_latest_idx
  on public.vocabulary_dataset_imports(source_id, created_at desc);
create index if not exists system_vocabulary_dataset_browse_idx
  on public.system_vocabulary(language, collection, jlpt_level, kana_group, sort_key) where is_active;
create index if not exists vocabulary_cards_dictionary_entry_idx
  on public.vocabulary_cards(user_id, dictionary_entry_id) where dictionary_entry_id is not null and deleted_at is null;

insert into public.dictionary_sources (slug, name, source_url, license, attribution, source_version)
values
  ('openjlpt', 'OpenJLPT', 'https://github.com/evanclan/OpenJLPT', 'CC BY-SA 4.0', 'OpenJLPT; EDRDG JMdict / KANJIDIC2; Jonathan Waller JLPT Resources; Tatoeba. See https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md', 'main'),
  ('toeic-vocab-tw', '完整 TOEIC 單字庫（English–Traditional Chinese）', 'https://huggingface.co/datasets/kknono668/toeic-vocab-tw', 'CC BY-SA 4.0', 'kknono668/toeic-vocab-tw (CC BY-SA 4.0). This is a community learning collection, not an official TOEIC vocabulary list.', '112.0')
on conflict (slug) do update set
  name = excluded.name,
  source_url = excluded.source_url,
  license = excluded.license,
  attribution = excluded.attribution,
  source_version = excluded.source_version,
  updated_at = now();

insert into public.vocabulary_collections (slug, language, name, description, source_id)
select 'jlpt_common', 'ja', 'JLPT 常見單字', '社群常用分級，非 JLPT 官方固定單字表。', id
from public.dictionary_sources where slug = 'openjlpt'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  source_id = excluded.source_id,
  updated_at = now();

insert into public.vocabulary_collections (slug, language, name, description, source_id)
select 'toeic_common', 'en', 'TOEIC 常見字彙', '社群整理的學習字彙，非 TOEIC 官方固定單字表。', id
from public.dictionary_sources where slug = 'toeic-vocab-tw'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  source_id = excluded.source_id,
  updated_at = now();

alter table public.dictionary_sources enable row level security;
alter table public.dictionary_entries enable row level security;
alter table public.vocabulary_collections enable row level security;
alter table public.vocabulary_collection_entries enable row level security;
alter table public.vocabulary_dataset_imports enable row level security;

revoke all on table public.dictionary_sources, public.dictionary_entries, public.vocabulary_collections, public.vocabulary_collection_entries, public.vocabulary_dataset_imports from anon, authenticated;

drop trigger if exists vault_app_dictionary_sources_updated_at on public.dictionary_sources;
create trigger vault_app_dictionary_sources_updated_at before update on public.dictionary_sources for each row execute procedure public.vault_app_set_updated_at();
drop trigger if exists vault_app_dictionary_entries_updated_at on public.dictionary_entries;
create trigger vault_app_dictionary_entries_updated_at before update on public.dictionary_entries for each row execute procedure public.vault_app_set_updated_at();
drop trigger if exists vault_app_vocabulary_collections_updated_at on public.vocabulary_collections;
create trigger vault_app_vocabulary_collections_updated_at before update on public.vocabulary_collections for each row execute procedure public.vault_app_set_updated_at();
drop trigger if exists vault_app_vocabulary_collection_entries_updated_at on public.vocabulary_collection_entries;
create trigger vault_app_vocabulary_collection_entries_updated_at before update on public.vocabulary_collection_entries for each row execute procedure public.vault_app_set_updated_at();
drop trigger if exists vault_app_vocabulary_dataset_imports_updated_at on public.vocabulary_dataset_imports;
create trigger vault_app_vocabulary_dataset_imports_updated_at before update on public.vocabulary_dataset_imports for each row execute procedure public.vault_app_set_updated_at();
