-- Run in the project's Supabase SQL Editor, NOT PowerShell.
-- Read-only acceptance checks. Never calls claim_due_calendar_reminders (that writes).
-- Never returns Vault secrets, subscription endpoints/keys, owners, or event titles.

-- 1. Cron target and recent execution. Expected next minute is an estimate, not metadata.
select j.jobid, j.jobname, j.schedule, j.active,
  position('/functions/v1/send-calendar-reminders' in j.command) > 0 as expected_dispatcher_target,
  r.start_time as last_run, r.end_time as last_end, r.status as last_status,
  case when j.active and j.schedule = '* * * * *'
    then date_trunc('minute', now()) + interval '1 minute' end as expected_next_minute
from cron.job j
left join lateral (
  select start_time, end_time, status from cron.job_run_details
  where jobid = j.jobid order by start_time desc limit 1
) r on true
where j.jobname = 'calendar-reminder-dispatch';

-- 2. pg_net HTTP aggregates. These are ALL recent pg_net callers, NOT definitively this job.
-- Do not infer Reminder success from this or cron status alone.
select status_code, count(*) as responses, max(created) as latest_response,
  bool_or(timed_out) as any_timeout
from net._http_response
where created >= now() - interval '15 minutes'
group by status_code order by status_code;

-- 3. Formal delivery logs. sent means provider acceptance, NOT proof of phone receipt.
select status, count(*) as deliveries, max(claimed_at) as last_claim,
  max(sent_at) as last_provider_acceptance
from public.calendar_notification_deliveries
group by status order by status;

-- 4. Most recent deliveries: omit sensitive identifiers, event titles and raw errors.
select occurrence_date, scheduled_at at time zone 'Asia/Taipei' as scheduled_taipei,
  claimed_at at time zone 'Asia/Taipei' as claimed_taipei,
  sent_at at time zone 'Asia/Taipei' as accepted_taipei,
  status, attempt_count, error_message is not null as has_error
from public.calendar_notification_deliveries
order by claimed_at desc limit 20;

-- 5. Recurrence/timezone and reminder/device counts only.
select recurrence_type, time_zone, count(*) as events
from public.calendar_events group by recurrence_type, time_zone order by recurrence_type, time_zone;
select count(*) as reminder_rules from public.calendar_event_reminders;
select enabled, count(*) as devices from public.calendar_push_subscriptions group by enabled;

-- 6. Test-only columns versus real delivery fields: inspect names, never drop anything.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('calendar_push_subscriptions', 'calendar_notification_deliveries')
  and (column_name like 'last_test%' or column_name = 'last_confirmed_received_at'
    or column_name in ('updated_at', 'last_seen_at', 'status', 'sent_at', 'error_message', 'attempt_count'))
order by table_name, column_name;
