-- Vocabulary learning module. All user data remains isolated by owner_id.

create table if not exists public.vocabulary_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null default 'ja' check (language ~ '^[a-z]{2,12}(-[A-Z]{2})?$'),
  word text not null check (char_length(btrim(word)) between 1 and 300),
  reading text,
  kana text,
  romaji text,
  pronunciation text,
  ipa text,
  primary_translation text,
  english_definition text,
  part_of_speech text,
  jlpt_level text check (jlpt_level is null or jlpt_level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  cefr_level text check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  frequency smallint check (frequency is null or frequency between 1 and 5),
  language_details jsonb not null default '{}'::jsonb,
  notes text,
  is_favorite boolean not null default false,
  mastery_level smallint not null default 0 check (mastery_level between 0 and 5),
  learning_status text not null default 'new' check (learning_status in ('new', 'learning', 'reviewing', 'mastered', 'paused')),
  review_count integer not null default 0 check (review_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  consecutive_correct integer not null default 0 check (consecutive_correct >= 0),
  current_interval_days integer not null default 0 check (current_interval_days >= 0),
  last_reviewed_at timestamptz,
  next_review_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vocabulary_meanings (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
  meaning text not null check (char_length(btrim(meaning)) between 1 and 1000),
  language text not null default 'zh-TW',
  description text,
  part_of_speech text,
  usage_context text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vocabulary_examples (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
  meaning_id uuid references public.vocabulary_meanings(id) on delete set null,
  sentence text not null check (char_length(btrim(sentence)) between 1 and 3000),
  reading text,
  translation text,
  source text,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vocabulary_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name citext not null check (char_length(btrim(name::text)) between 1 and 50),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.vocabulary_card_tags (
  card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
  tag_id uuid not null references public.vocabulary_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, tag_id)
);

create table if not exists public.vocabulary_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.vocabulary_deck_cards (
  deck_id uuid not null references public.vocabulary_decks(id) on delete cascade,
  card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (deck_id, card_id)
);

create table if not exists public.vocabulary_review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
  rating text not null check (rating in ('again', 'difficult', 'good', 'easy', 'mastered')),
  answer_result boolean not null,
  old_mastery smallint not null check (old_mastery between 0 and 5),
  new_mastery smallint not null check (new_mastery between 0 and 5),
  old_interval integer not null check (old_interval >= 0),
  new_interval integer not null check (new_interval >= 0),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.vocabulary_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_new_goal smallint not null default 10 check (daily_new_goal between 0 and 200),
  daily_review_goal smallint not null default 30 check (daily_review_goal between 1 and 500),
  flashcard_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vocabulary_cards_active_user_idx on public.vocabulary_cards (user_id, updated_at desc) where deleted_at is null;
create index if not exists vocabulary_cards_due_idx on public.vocabulary_cards (user_id, next_review_at) where deleted_at is null and learning_status <> 'paused';
create index if not exists vocabulary_cards_word_idx on public.vocabulary_cards (user_id, language, word) where deleted_at is null;
create index if not exists vocabulary_cards_favorite_idx on public.vocabulary_cards (user_id, updated_at desc) where deleted_at is null and is_favorite;
create index if not exists vocabulary_meanings_card_idx on public.vocabulary_meanings (card_id, sort_order);
create index if not exists vocabulary_examples_card_idx on public.vocabulary_examples (card_id, created_at desc);
create index if not exists vocabulary_review_logs_user_idx on public.vocabulary_review_logs (user_id, reviewed_at desc);
create index if not exists vocabulary_review_logs_card_idx on public.vocabulary_review_logs (card_id, reviewed_at desc);

create trigger vault_app_vocabulary_cards_updated_at before update on public.vocabulary_cards for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vocabulary_tags_updated_at before update on public.vocabulary_tags for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vocabulary_decks_updated_at before update on public.vocabulary_decks for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_vocabulary_settings_updated_at before update on public.vocabulary_settings for each row execute procedure public.vault_app_set_updated_at();

alter table public.vocabulary_cards enable row level security;
alter table public.vocabulary_meanings enable row level security;
alter table public.vocabulary_examples enable row level security;
alter table public.vocabulary_tags enable row level security;
alter table public.vocabulary_card_tags enable row level security;
alter table public.vocabulary_decks enable row level security;
alter table public.vocabulary_deck_cards enable row level security;
alter table public.vocabulary_review_logs enable row level security;
alter table public.vocabulary_settings enable row level security;

revoke all on table public.vocabulary_cards, public.vocabulary_meanings, public.vocabulary_examples, public.vocabulary_tags, public.vocabulary_card_tags, public.vocabulary_decks, public.vocabulary_deck_cards, public.vocabulary_review_logs, public.vocabulary_settings from anon, authenticated;

-- The application uses a server-only service key. These policies are a second ownership boundary
-- if direct authenticated access is ever granted in a future release.
create policy "vocabulary cards: owner" on public.vocabulary_cards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vocabulary meanings: card owner" on public.vocabulary_meanings for all to authenticated using (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid())));
create policy "vocabulary examples: card owner" on public.vocabulary_examples for all to authenticated using (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid())));
create policy "vocabulary tags: owner" on public.vocabulary_tags for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vocabulary card tags: card owner" on public.vocabulary_card_tags for all to authenticated using (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.vocabulary_cards c where c.id = card_id and c.user_id = (select auth.uid())));
create policy "vocabulary decks: owner" on public.vocabulary_decks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vocabulary deck cards: deck owner" on public.vocabulary_deck_cards for all to authenticated using (exists (select 1 from public.vocabulary_decks d where d.id = deck_id and d.user_id = (select auth.uid()))) with check (exists (select 1 from public.vocabulary_decks d where d.id = deck_id and d.user_id = (select auth.uid())));
create policy "vocabulary review logs: owner" on public.vocabulary_review_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vocabulary settings: owner" on public.vocabulary_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
