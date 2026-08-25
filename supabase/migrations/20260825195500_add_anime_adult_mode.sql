-- Adult content is opt-in.  Existing libraries remain non-adult and are never
-- surfaced by the normal Anime Library query.

alter table public.anime_library
  add column if not exists is_adult boolean not null default false,
  add column if not exists content_rating text,
  add column if not exists adult_source text,
  add column if not exists external_url text;

alter table public.anime_library
  drop constraint if exists anime_library_external_url_https_check;

alter table public.anime_library
  add constraint anime_library_external_url_https_check
  check (external_url is null or external_url ~* '^https://');

create index if not exists anime_library_adult_user_idx
  on public.anime_library (user_id, updated_at desc)
  where deleted_at is null and is_adult;

create table if not exists public.anime_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  adult_mode_enabled boolean not null default false,
  adult_hidden_by_default boolean not null default true,
  require_adult_passkey boolean not null default false,
  blur_adult_covers boolean not null default true,
  show_adult_in_main_library boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vault_app_anime_preferences_updated_at on public.anime_preferences;
create trigger vault_app_anime_preferences_updated_at
before update on public.anime_preferences
for each row execute procedure public.vault_app_set_updated_at();

alter table public.anime_preferences enable row level security;
revoke all on table public.anime_preferences from anon, authenticated;
drop policy if exists "anime preferences: owner" on public.anime_preferences;
create policy "anime preferences: owner" on public.anime_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
