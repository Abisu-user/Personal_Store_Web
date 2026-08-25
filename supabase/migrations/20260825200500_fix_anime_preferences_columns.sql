-- Some early manual installs created anime_preferences before all adult-mode
-- controls existed.  This is additive and safe to run more than once.

alter table public.anime_preferences
  add column if not exists adult_mode_enabled boolean not null default false,
  add column if not exists adult_hidden_by_default boolean not null default true,
  add column if not exists require_adult_passkey boolean not null default false,
  add column if not exists blur_adult_covers boolean not null default true,
  add column if not exists show_adult_in_main_library boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

grant select, insert, update, delete on table public.anime_preferences to service_role;
notify pgrst, 'reload schema';
