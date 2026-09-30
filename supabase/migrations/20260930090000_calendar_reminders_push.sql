-- Extend the existing calendar; old none/yearly rows remain unchanged.
alter table public.calendar_events drop constraint if exists calendar_events_recurrence_type_check;
alter table public.calendar_events add constraint calendar_events_recurrence_type_check
  check (recurrence_type in ('none', 'daily', 'weekly', 'yearly'));
alter table public.calendar_events
  add column if not exists time_zone text not null default 'Asia/Taipei',
  add column if not exists all_day_reminder_time time without time zone not null default '09:00',
  add column if not exists reminder_revision integer not null default 1;

create table public.calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes between 0 and 43200),
  created_at timestamptz not null default now(),
  unique (event_id, offset_minutes)
);
create index calendar_event_reminders_owner_event_idx on public.calendar_event_reminders(owner_id, event_id);

create table public.calendar_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_push_subscriptions_owner_idx on public.calendar_push_subscriptions(owner_id) where enabled;

create table public.calendar_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  reminder_id uuid not null references public.calendar_event_reminders(id) on delete cascade,
  occurrence_date date not null,
  event_revision integer not null,
  scheduled_at timestamptz not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'skipped')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  attempt_count integer not null default 1,
  error_message text,
  unique (event_id, reminder_id, occurrence_date, event_revision)
);
create index calendar_notification_deliveries_owner_idx on public.calendar_notification_deliveries(owner_id, scheduled_at desc);

alter table public.calendar_event_reminders enable row level security;
alter table public.calendar_push_subscriptions enable row level security;
alter table public.calendar_notification_deliveries enable row level security;
-- User access is only through authenticated server routes; the dispatcher uses service_role.
revoke all on public.calendar_event_reminders, public.calendar_push_subscriptions, public.calendar_notification_deliveries from anon, authenticated;

create or replace function public.save_calendar_event_with_reminders(
  p_owner_id uuid, p_event jsonb, p_reminders integer[], p_create boolean
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := (p_event->>'id')::uuid;
  v_saved uuid;
  v_original public.calendar_events%rowtype;
begin
  if p_owner_id is null or v_id is null or p_reminders is null
     or exists (select 1 from unnest(p_reminders) m where m < 0 or m > 43200)
     or (select count(*) from unnest(p_reminders)) > 12
     or not exists (select 1 from pg_timezone_names where name = p_event->>'timeZone') then
    raise exception 'Invalid calendar event or reminders';
  end if;
  if p_create then
    insert into public.calendar_events
      (id, owner_id, title, description, starts_at, ends_at, event_date, event_time, all_day, recurrence_type, color, time_zone, all_day_reminder_time)
    values
      (v_id, p_owner_id, p_event->>'title', nullif(p_event->>'description', ''), (p_event->>'startsAt')::timestamptz,
       (p_event->>'endsAt')::timestamptz, (p_event->>'eventDate')::date, (p_event->>'eventTime')::time,
       (p_event->>'allDay')::boolean, p_event->>'recurrenceType', p_event->>'color',
       p_event->>'timeZone', (p_event->>'allDayReminderTime')::time)
    on conflict (id) do nothing returning id into v_saved;
    if v_saved is null then
      select id into v_saved from public.calendar_events where id = v_id and owner_id = p_owner_id;
      if v_saved is null then raise exception 'Calendar event belongs to another account'; end if;
      return v_saved; -- idempotent Background Save POST retry
    end if;
  else
    select * into v_original from public.calendar_events where id = v_id and owner_id = p_owner_id for update;
    if not found then raise exception 'Calendar event not found'; end if;
    update public.calendar_events set
      title = p_event->>'title', description = nullif(p_event->>'description', ''),
      starts_at = (p_event->>'startsAt')::timestamptz, ends_at = (p_event->>'endsAt')::timestamptz,
      event_date = (p_event->>'eventDate')::date, event_time = (p_event->>'eventTime')::time,
      all_day = (p_event->>'allDay')::boolean, recurrence_type = p_event->>'recurrenceType',
      color = p_event->>'color', time_zone = p_event->>'timeZone',
      all_day_reminder_time = (p_event->>'allDayReminderTime')::time,
      reminder_revision = v_original.reminder_revision + case when
        v_original.title is distinct from p_event->>'title' or
        v_original.event_date is distinct from (p_event->>'eventDate')::date or
        v_original.event_time is distinct from (p_event->>'eventTime')::time or
        v_original.all_day is distinct from (p_event->>'allDay')::boolean or
        v_original.recurrence_type is distinct from p_event->>'recurrenceType' or
        v_original.time_zone is distinct from p_event->>'timeZone' or
        v_original.all_day_reminder_time is distinct from (p_event->>'allDayReminderTime')::time
      then 1 else 0 end
    where id = v_id and owner_id = p_owner_id returning id into v_saved;
    delete from public.calendar_event_reminders
    where event_id = v_id and owner_id = p_owner_id and offset_minutes <> all(p_reminders);
  end if;
  insert into public.calendar_event_reminders(owner_id, event_id, offset_minutes)
  select p_owner_id, v_id, distinct_offset from (select distinct unnest(p_reminders) as distinct_offset) offsets
  on conflict (event_id, offset_minutes) do nothing;
  return v_saved;
end $$;
revoke all on function public.save_calendar_event_with_reminders(uuid, jsonb, integer[], boolean) from public, anon, authenticated;
grant execute on function public.save_calendar_event_with_reminders(uuid, jsonb, integer[], boolean) to service_role;

-- A single atomic claim per event/reminder/occurrence/revision. No future rows are pre-generated.
create or replace function public.claim_due_calendar_reminders(p_limit integer default 200)
returns table(delivery_id uuid, owner_id uuid, event_id uuid, reminder_id uuid,
  occurrence_date date, event_revision integer, event_title text, offset_minutes integer)
language sql security definer set search_path = public, pg_temp as $$
  with candidates as (
    select e.id as event_id, e.owner_id, e.title, e.reminder_revision,
      r.id as reminder_id, r.offset_minutes, occurrence.day::date as occurrence_date,
      (make_timestamptz(extract(year from occurrence.day)::integer,
        extract(month from occurrence.day)::integer, extract(day from occurrence.day)::integer,
        extract(hour from case when e.all_day then e.all_day_reminder_time else e.event_time end)::integer,
        extract(minute from case when e.all_day then e.all_day_reminder_time else e.event_time end)::integer,
        0, e.time_zone) - r.offset_minutes * interval '1 minute') as scheduled_at
    from public.calendar_events e
    join public.calendar_event_reminders r on r.event_id = e.id and r.owner_id = e.owner_id
    cross join lateral generate_series(
      ((now() + r.offset_minutes * interval '1 minute') at time zone e.time_zone)::date - 1,
      ((now() + r.offset_minutes * interval '1 minute') at time zone e.time_zone)::date + 1,
      interval '1 day') occurrence(day)
    where occurrence.day::date >= e.event_date
      and (e.recurrence_type = 'daily'
        or (e.recurrence_type = 'weekly' and (occurrence.day::date - e.event_date) % 7 = 0)
        or (e.recurrence_type = 'yearly' and extract(month from occurrence.day) = extract(month from e.event_date)
          and extract(day from occurrence.day) = extract(day from e.event_date))
        or (e.recurrence_type = 'none' and occurrence.day::date = e.event_date))
  ), claimed as (
    insert into public.calendar_notification_deliveries
      (owner_id, event_id, reminder_id, occurrence_date, event_revision, scheduled_at)
    select c.owner_id, c.event_id, c.reminder_id, c.occurrence_date, c.reminder_revision, c.scheduled_at
    from candidates c
    where c.scheduled_at <= now() and c.scheduled_at > now() - interval '5 minutes'
    order by c.scheduled_at limit greatest(1, least(p_limit, 500))
    on conflict (event_id, reminder_id, occurrence_date, event_revision) do nothing
    returning id, owner_id, event_id, reminder_id, occurrence_date, event_revision
  )
  select c.id, c.owner_id, c.event_id, c.reminder_id, c.occurrence_date,
    c.event_revision, e.title, r.offset_minutes
  from claimed c join public.calendar_events e on e.id = c.event_id and e.reminder_revision = c.event_revision
  join public.calendar_event_reminders r on r.id = c.reminder_id;
$$;
revoke all on function public.claim_due_calendar_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_calendar_reminders(integer) to service_role;
