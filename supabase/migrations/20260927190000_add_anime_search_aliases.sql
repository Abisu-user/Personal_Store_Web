-- Additive adult-anime search index. No existing library titles are rewritten.
create extension if not exists pg_trgm;

alter table public.anime_library
  add column if not exists title_is_custom boolean;

create table if not exists public.anime_search_aliases (
  id uuid primary key default gen_random_uuid(),
  anilist_id integer not null check (anilist_id > 0),
  alias text not null check (char_length(btrim(alias)) between 1 and 500),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 500),
  language text not null check (char_length(language) between 2 and 32),
  source text not null check (char_length(source) between 2 and 80),
  source_reference text check (source_reference is null or char_length(source_reference) <= 500),
  scope text not null check (scope in ('global', 'user')),
  user_id uuid references public.profiles(id) on delete cascade,
  is_adult boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_search_alias_identity_unique unique nulls not distinct
    (scope, user_id, anilist_id, normalized_alias),
  constraint anime_search_alias_scope_check check (
    (scope = 'global' and user_id is null and is_verified and source <> 'user') or
    (scope = 'user' and user_id is not null and not is_verified)
  )
);

create index if not exists anime_search_alias_lookup_idx
  on public.anime_search_aliases (is_adult, scope, normalized_alias text_pattern_ops);
create index if not exists anime_search_alias_owner_idx
  on public.anime_search_aliases (user_id, anilist_id)
  where scope = 'user';
create index if not exists anime_search_alias_anilist_idx
  on public.anime_search_aliases (anilist_id, is_adult);
create index if not exists anime_search_alias_substring_idx
  on public.anime_search_aliases using gin (normalized_alias gin_trgm_ops);

drop trigger if exists vault_app_anime_search_aliases_updated_at on public.anime_search_aliases;
create trigger vault_app_anime_search_aliases_updated_at
before update on public.anime_search_aliases
for each row execute procedure public.vault_app_set_updated_at();

-- API routes use the service-role client and derive user_id from Supabase Auth.
-- Browser roles cannot read even global adult aliases directly.
alter table public.anime_search_aliases enable row level security;
revoke all on table public.anime_search_aliases from anon, authenticated;
grant select, insert, update, delete on table public.anime_search_aliases to service_role;

notify pgrst, 'reload schema';
