create table if not exists public.app_locks (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  pin_mode text not null check (pin_mode in ('pin4', 'pin6')),
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_locks enable row level security;
revoke all on table public.app_locks from anon, authenticated;
