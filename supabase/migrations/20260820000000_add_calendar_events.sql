-- Private calendar events. These are separate from Vault payloads: never put secrets in an event description.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  color text not null default 'indigo' check (color in ('indigo', 'blue', 'green', 'amber', 'rose')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists calendar_events_owner_starts_idx
  on public.calendar_events (owner_id, starts_at);

create trigger vault_app_calendar_events_updated_at
before update on public.calendar_events
for each row execute procedure public.vault_app_set_updated_at();

alter table public.calendar_events enable row level security;

create policy "calendar events: owner only"
on public.calendar_events for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on table public.calendar_events from anon, authenticated;
