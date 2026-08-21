create table if not exists public.folder_locks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_kind text not null check (folder_kind in ('bookmark', 'note', 'code', 'file', 'photo')),
  folder_id uuid not null,
  password_mode text not null check (password_mode in ('pin4', 'pin6', 'password')),
  password_salt text not null,
  password_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, folder_kind, folder_id)
);

create table if not exists public.folder_unlock_sessions (
  id uuid primary key default gen_random_uuid(),
  folder_lock_id uuid not null references public.folder_locks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists folder_locks_owner_folder_idx on public.folder_locks(owner_id, folder_kind, folder_id);
create index if not exists folder_unlock_sessions_owner_lock_expiry_idx on public.folder_unlock_sessions(owner_id, folder_lock_id, expires_at);

alter table public.folder_locks enable row level security;
alter table public.folder_unlock_sessions enable row level security;
revoke all on table public.folder_locks from anon, authenticated;
revoke all on table public.folder_unlock_sessions from anon, authenticated;

