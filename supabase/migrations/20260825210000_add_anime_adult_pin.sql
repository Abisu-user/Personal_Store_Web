-- A separate PIN protects Adult Anime access. It is deliberately distinct
-- from the Vault/App PIN and only a PBKDF2 hash is ever stored.

alter table public.anime_preferences
  add column if not exists adult_access_mode text not null default 'none',
  add column if not exists adult_pin_salt text,
  add column if not exists adult_pin_hash text,
  add column if not exists adult_pin_failed_attempts integer not null default 0,
  add column if not exists adult_pin_locked_until timestamptz;

alter table public.anime_preferences
  drop constraint if exists anime_preferences_adult_access_mode_check;

alter table public.anime_preferences
  add constraint anime_preferences_adult_access_mode_check
  check (adult_access_mode in ('none', 'passkey', 'pin4', 'pin6'));

-- Carry existing Face ID choice into the new explicit access method.
update public.anime_preferences
set adult_access_mode = 'passkey'
where require_adult_passkey and adult_access_mode = 'none';

grant select, insert, update, delete on table public.anime_preferences to service_role;
notify pgrst, 'reload schema';
