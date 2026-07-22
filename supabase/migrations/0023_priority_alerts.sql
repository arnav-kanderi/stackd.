-- stackd. Section 6 — priority alerts for high-match opportunities (spec
-- §3.1 premium feature, build-plan item 5). Push notifications for NEW
-- opportunities that score especially high (Stage-1 trigger, optional
-- Stage-2 for the actual notification copy) for a premium student. Builds
-- on Section 2's push notification Edge Function pattern
-- (notify-upcoming-deadlines) and Section 4's Stage-2 scoring.
--
-- Dedup ledger (same shape as chat_rate_limit/subscription_events -- a
-- server-only table, RLS enabled with zero policies): without this, a
-- daily cron re-run would re-notify the same student about the same
-- opportunity every day it stays in the "new" window.

create table if not exists priority_alerts_sent (
  user_id uuid not null references profiles(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table priority_alerts_sent enable row level security;

create index if not exists priority_alerts_sent_user_id_idx on priority_alerts_sent(user_id);

-- 08:00 UTC daily -- after the two existing cron jobs (06:00 deactivate,
-- 07:00 deadline reminders, see 0009_cron_jobs.sql) so it runs against that
-- day's already-deactivated opportunity set.
select
  cron.schedule(
    'notify-priority-matches-daily',
    '0 8 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify-priority-matches',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $$
  )
where not exists (
  select 1 from cron.job where jobname = 'notify-priority-matches-daily'
);
