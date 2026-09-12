-- Private KTV song-number collection. "All" is a frontend-only system view.

create extension if not exists citext;

create table if not exists public.ktv_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name citext not null check (char_length(btrim(name::text)) between 1 and 50),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.ktv_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_number text not null check (char_length(btrim(song_number)) between 1 and 40),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  artist text not null check (char_length(btrim(artist)) between 1 and 200),
  category_id uuid references public.ktv_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, song_number)
);

create index if not exists ktv_categories_user_sort_idx on public.ktv_categories (user_id, sort_order, name);
create index if not exists ktv_songs_user_updated_idx on public.ktv_songs (user_id, updated_at desc);
create index if not exists ktv_songs_user_category_idx on public.ktv_songs (user_id, category_id);
create index if not exists ktv_songs_user_title_idx on public.ktv_songs (user_id, title);
create index if not exists ktv_songs_user_artist_idx on public.ktv_songs (user_id, artist);

drop trigger if exists vault_app_ktv_categories_updated_at on public.ktv_categories;
create trigger vault_app_ktv_categories_updated_at before update on public.ktv_categories for each row execute procedure public.vault_app_set_updated_at();
drop trigger if exists vault_app_ktv_songs_updated_at on public.ktv_songs;
create trigger vault_app_ktv_songs_updated_at before update on public.ktv_songs for each row execute procedure public.vault_app_set_updated_at();

alter table public.ktv_categories enable row level security;
alter table public.ktv_songs enable row level security;

drop policy if exists "ktv categories: owner" on public.ktv_categories;
create policy "ktv categories: owner" on public.ktv_categories for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "ktv songs: owner" on public.ktv_songs;
create policy "ktv songs: owner" on public.ktv_songs for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    category_id is null
    or exists (
      select 1 from public.ktv_categories category
      where category.id = category_id and category.user_id = (select auth.uid())
    )
  )
);

revoke all on table public.ktv_categories, public.ktv_songs from anon, authenticated;
