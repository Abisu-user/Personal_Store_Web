-- Canonical dictionary translations are shared lookup data, never user cards.
-- The application writes this table only through the server-side secret key.

create table if not exists public.dictionary_translations (
  id uuid primary key default gen_random_uuid(),
  source_language text not null check (source_language in ('ja', 'en')),
  normalized_word text not null check (char_length(normalized_word) between 1 and 300),
  target_language text not null default 'zh-TW' check (target_language = 'zh-TW'),
  primary_meaning text,
  meanings_json jsonb not null default '[]'::jsonb,
  source text not null default 'translation-fallback',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_language, normalized_word, target_language)
);

create index if not exists dictionary_translations_lookup_idx
  on public.dictionary_translations (source_language, normalized_word, target_language);

create trigger vault_app_dictionary_translations_updated_at
  before update on public.dictionary_translations
  for each row execute procedure public.vault_app_set_updated_at();

alter table public.dictionary_translations enable row level security;
revoke all on table public.dictionary_translations from anon, authenticated;
