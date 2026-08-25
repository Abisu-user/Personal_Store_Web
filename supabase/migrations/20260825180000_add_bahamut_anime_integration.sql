-- Official Bahamut Animation Crazy catalogue metadata only. No account,
-- cookie, playback, or viewing-history data is collected or stored.
alter table public.anime_library
  add column if not exists bahamut_available boolean,
  add column if not exists bahamut_url text,
  add column if not exists bahamut_title text,
  add column if not exists bahamut_sn bigint,
  add column if not exists bahamut_last_checked_at timestamptz;

do $$ begin
  alter table public.anime_library add constraint anime_library_bahamut_sn_check check (bahamut_sn is null or bahamut_sn > 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.anime_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_streaming_platform text not null default 'bahamut' check (preferred_streaming_platform in ('bahamut', 'netflix', 'crunchyroll', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  create trigger vault_app_anime_preferences_updated_at before update on public.anime_preferences for each row execute procedure public.vault_app_set_updated_at();
exception when duplicate_object then null;
end $$;
alter table public.anime_preferences enable row level security;
revoke all on table public.anime_preferences from anon, authenticated;
do $$ begin
  create policy "anime preferences: owner" on public.anime_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;
