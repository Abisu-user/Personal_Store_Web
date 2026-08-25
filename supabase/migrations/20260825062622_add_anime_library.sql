-- Personal Anime Library. External catalogue metadata is cached here while all
-- viewing progress and notes remain private to the owning Personal Vault user.

create table if not exists public.anime_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  external_source text not null default 'jikan' check (external_source in ('jikan')),
  external_id text not null check (char_length(btrim(external_id)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  title_japanese text,
  title_english text,
  title_chinese text,
  original_title text,
  cover_url text,
  banner_url text,
  synopsis text,
  anime_type text,
  broadcast_status text,
  episodes integer check (episodes is null or episodes >= 0),
  episode_duration integer check (episode_duration is null or episode_duration >= 0),
  release_year integer check (release_year is null or release_year between 1900 and 2200),
  season text check (season is null or season in ('winter', 'spring', 'summer', 'fall')),
  start_date date,
  end_date date,
  age_rating text,
  source_material text,
  public_score numeric(4,2) check (public_score is null or public_score between 0 and 10),
  genres jsonb not null default '[]'::jsonb,
  studios jsonb not null default '[]'::jsonb,
  relations jsonb not null default '[]'::jsonb,
  series_external_id text,
  series_title text,
  watch_status text not null default 'planning' check (watch_status in ('planning', 'watching', 'completed', 'paused', 'dropped')),
  watched_episodes integer not null default 0 check (watched_episodes >= 0),
  rating numeric(3,1) check (rating is null or rating between 0 and 10),
  favorite boolean not null default false,
  personal_rank text check (personal_rank is null or personal_rank in ('normal', 'like', 'love', 'masterpiece')),
  notes text,
  started_watching_at date,
  completed_at date,
  last_watched_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_source, external_id),
  check (episodes is null or watched_episodes <= episodes)
);

create table if not exists public.anime_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name citext not null check (char_length(btrim(name::text)) between 1 and 50),
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.anime_library_tags (
  anime_id uuid not null references public.anime_library(id) on delete cascade,
  tag_id uuid not null references public.anime_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (anime_id, tag_id)
);

create table if not exists public.anime_watch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  anime_id uuid not null references public.anime_library(id) on delete cascade,
  from_episode integer not null check (from_episode >= 0),
  to_episode integer not null check (to_episode >= 0),
  action text not null check (action in ('set', 'increment', 'decrement')),
  watched_at timestamptz not null default now(),
  check (to_episode <> from_episode)
);

create index if not exists anime_library_active_user_idx on public.anime_library (user_id, updated_at desc) where deleted_at is null;
create index if not exists anime_library_status_idx on public.anime_library (user_id, watch_status, last_watched_at desc) where deleted_at is null;
create index if not exists anime_library_favorite_idx on public.anime_library (user_id, updated_at desc) where deleted_at is null and favorite;
create index if not exists anime_library_tags_tag_idx on public.anime_library_tags (tag_id, anime_id);
create index if not exists anime_watch_logs_user_idx on public.anime_watch_logs (user_id, watched_at desc);
create index if not exists anime_watch_logs_anime_idx on public.anime_watch_logs (anime_id, watched_at desc);

create trigger vault_app_anime_library_updated_at before update on public.anime_library for each row execute procedure public.vault_app_set_updated_at();
create trigger vault_app_anime_tags_updated_at before update on public.anime_tags for each row execute procedure public.vault_app_set_updated_at();

alter table public.anime_library enable row level security;
alter table public.anime_tags enable row level security;
alter table public.anime_library_tags enable row level security;
alter table public.anime_watch_logs enable row level security;

revoke all on table public.anime_library, public.anime_tags, public.anime_library_tags, public.anime_watch_logs from anon, authenticated;

create policy "anime library: owner" on public.anime_library for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "anime tags: owner" on public.anime_tags for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "anime library tags: anime owner" on public.anime_library_tags for all to authenticated using (exists (select 1 from public.anime_library a where a.id = anime_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from public.anime_library a where a.id = anime_id and a.user_id = (select auth.uid())));
create policy "anime watch logs: owner" on public.anime_watch_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
