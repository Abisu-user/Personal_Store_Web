-- Dictionary / AI assistant support for Vocabulary.  Dictionary data is cached
-- separately from a user's private learning cards; AI responses remain private
-- to the requesting account.

create table if not exists public.vocabulary_lookup_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('japanese_dictionary', 'english_dictionary')),
  language text not null check (language in ('ja', 'en')),
  normalized_query text not null check (char_length(normalized_query) between 1 and 300),
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, language, normalized_query)
);

create table if not exists public.vocabulary_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null check (language in ('ja', 'en')),
  normalized_query text not null check (char_length(normalized_query) between 1 and 300),
  query text not null check (char_length(btrim(query)) between 1 and 300),
  searched_at timestamptz not null default now(),
  unique (user_id, language, normalized_query)
);

create table if not exists public.vocabulary_ai_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('explain', 'compare', 'translate', 'autocomplete')),
  language text not null default 'auto' check (language in ('ja', 'en', 'auto')),
  normalized_prompt text not null check (char_length(normalized_prompt) between 1 and 2000),
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, action, language, normalized_prompt)
);

create index if not exists vocabulary_lookup_cache_expiry_idx on public.vocabulary_lookup_cache (expires_at);
create index if not exists vocabulary_search_history_user_language_idx on public.vocabulary_search_history (user_id, language, searched_at desc);
create index if not exists vocabulary_ai_cache_user_expiry_idx on public.vocabulary_ai_cache (user_id, expires_at);

create trigger vault_app_vocabulary_lookup_cache_updated_at before update on public.vocabulary_lookup_cache for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vocabulary_ai_cache_updated_at before update on public.vocabulary_ai_cache for each row execute procedure public.vault_app_set_updated_at();

alter table public.vocabulary_lookup_cache enable row level security;
alter table public.vocabulary_search_history enable row level security;
alter table public.vocabulary_ai_cache enable row level security;

revoke all on table public.vocabulary_lookup_cache, public.vocabulary_search_history, public.vocabulary_ai_cache from anon, authenticated;

create policy "vocabulary search history: owner" on public.vocabulary_search_history for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vocabulary AI cache: owner" on public.vocabulary_ai_cache for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
