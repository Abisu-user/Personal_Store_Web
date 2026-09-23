-- Global, server-managed cache for public external anime indexes.
-- Deliberately has no FK to anime_library: source rows may exist before a user
-- saves an anime, and an ambiguous match must never create PostgREST embeds.

create table if not exists public.anime_external_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('anime1')),
  source_item_key text not null,
  source_title text not null,
  normalized_title text not null,
  source_url text not null,
  episode_text text,
  year integer check (year is null or year between 1900 and 2200),
  season_text text,
  subtitle_group text,
  anilist_id bigint,
  match_confidence numeric(5,4) check (match_confidence is null or match_confidence between 0 and 1),
  match_method text,
  manual_match boolean not null default false,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_external_sources_source_url_https_check
    check (source_url ~ '^https://anime1\.me(?:/|\?|$)'),
  unique (source, source_url)
);

create index if not exists anime_external_sources_active_title_idx
  on public.anime_external_sources (source, normalized_title)
  where is_active;
create index if not exists anime_external_sources_anilist_idx
  on public.anime_external_sources (source, anilist_id)
  where anilist_id is not null;
create index if not exists anime_external_sources_refresh_idx
  on public.anime_external_sources (source, refreshed_at desc);

drop trigger if exists vault_app_anime_external_sources_updated_at
  on public.anime_external_sources;
create trigger vault_app_anime_external_sources_updated_at
before update on public.anime_external_sources
for each row execute procedure public.vault_app_set_updated_at();

-- Browser clients never access this global cache directly. Authenticated users
-- receive only normalized availability fields through the authenticated API.
alter table public.anime_external_sources enable row level security;
revoke all on table public.anime_external_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.anime_external_sources to service_role;

notify pgrst, 'reload schema';
