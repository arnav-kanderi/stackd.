-- stackd. Section 2 — daily cron scheduling for the two Edge Functions
-- (spec §4: "Scheduled jobs (Supabase Edge Functions, daily cron)").
--
-- Standard Supabase recipe: pg_cron schedules a SQL job that calls
-- net.http_post against the deployed Edge Function URL, authenticated with
-- the project's service role key. The URL and key are read from Vault
-- secrets (project_url / service_role_key) rather than hard-coded here, so
-- no credential is committed to the migration file. Those two secrets must
-- be created once per environment — see the accompanying seed step run via
-- `supabase db query --linked` (not part of this migration) or manually in
-- the SQL editor:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 06:00 UTC daily — flip opportunities.is_active past deadline.
select
  cron.schedule(
    'deactivate-expired-opportunities-daily',
    '0 6 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/deactivate-expired-opportunities',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $$
  )
where not exists (
  select 1 from cron.job where jobname = 'deactivate-expired-opportunities-daily'
);

-- 07:00 UTC daily — check upcoming stack_items deadlines, send Expo pushes.
select
  cron.schedule(
    'notify-upcoming-deadlines-daily',
    '0 7 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify-upcoming-deadlines',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $$
  )
where not exists (
  select 1 from cron.job where jobname = 'notify-upcoming-deadlines-daily'
);
