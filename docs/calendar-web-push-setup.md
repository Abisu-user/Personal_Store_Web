# Calendar Web Push production setup

Code deployment alone cannot enable delivery. Apply the `20260930090000_calendar_reminders_push.sql` migration **before** deploying the new web app or Edge Function. Existing calendar rows stay intact.

1. Generate one VAPID key pair (for example, with `npx web-push generate-vapid-keys`). Keep the private key outside Git. Set `VAPID_PUBLIC_KEY` in the Next/Vercel server environment. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (`mailto:` contact) as Supabase Edge Function secrets. Both public keys must match.
2. Generate a separate long random `CALENDAR_DISPATCH_SECRET` (at least 32 bytes). Set it as an Edge Function secret. Store the same value in Supabase Vault as `calendar_dispatch_secret`. Never use a public/anon key as this secret.
3. Deploy `send-calendar-reminders` with `supabase functions deploy send-calendar-reminders --no-verify-jwt`. The function rejects calls without the private dispatch header. Confirm the URL is `<project-url>/functions/v1/send-calendar-reminders`.
4. Enable `pg_cron` and `pg_net` in Supabase Database Extensions. Store the exact project URL in Vault as `calendar_project_url`. Schedule **one** job in the SQL Editor (substitute neither value into the SQL text):

```sql
select cron.schedule(
  'calendar-reminder-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_project_url') || '/functions/v1/send-calendar-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-calendar-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_dispatch_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The job should be installed only once. Before re-running, inspect `cron.job` for `jobname = 'calendar-reminder-dispatch'`; do not create duplicate jobs. A cron request that fails or arrives more than five minutes late will not backfill old reminders with misleading text.

The dispatcher uses an atomic database claim with a unique event/reminder/occurrence/revision key. It makes one send attempt per claimed occurrence to avoid duplicate lock-screen alerts when cron overlaps. A process crash after claiming but before sending may cause a missed notification; there is deliberately no blind retry after an ambiguous network outcome. Delivery status records `sent`, `failed`, or `skipped`. Editing the event changes its revision when schedule fields change; removing reminder rules or events cascades away pending records. There are no future delivery rows to reschedule.

The existing `/sw.js` is extended, not replaced. Only static shell assets are cached; private calendar data and push payloads are never cached. Push subscriptions are scoped by authenticated server context, not client-supplied user IDs. iOS requires a compatible Home Screen web app and explicit user gesture for subscription. Test with a real installed iPhone PWA after the migration, secrets, Edge deployment, and cron are configured; desktop tests cannot establish iOS lock-screen delivery.
