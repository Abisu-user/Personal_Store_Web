-- Extend the existing private calendar table; existing rows remain one-time timed events.
alter table public.calendar_events
  add column if not exists event_date date,
  add column if not exists event_time time without time zone,
  add column if not exists all_day boolean not null default false,
  add column if not exists recurrence_type text not null default 'none';

update public.calendar_events
set event_date = (starts_at at time zone 'Asia/Taipei')::date,
    event_time = (starts_at at time zone 'Asia/Taipei')::time
where event_date is null;

alter table public.calendar_events
  alter column event_date set not null;

alter table public.calendar_events
  add constraint calendar_events_recurrence_type_check
  check (recurrence_type in ('none', 'yearly'));

create index if not exists calendar_events_owner_recurrence_date_idx
  on public.calendar_events (owner_id, recurrence_type, event_date);
