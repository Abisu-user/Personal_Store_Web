-- Only explicitly designated owners may trigger a global licensed-dataset import.
-- This prevents a normal authenticated account from repeatedly consuming the
-- server-side importer or changing shared catalogue data.

create table if not exists public.vocabulary_catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vocabulary_catalog_admins enable row level security;
revoke all on table public.vocabulary_catalog_admins from anon, authenticated;
