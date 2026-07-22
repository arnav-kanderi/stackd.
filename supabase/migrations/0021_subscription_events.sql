-- stackd. Section 6 — payment integration wiring (spec §3.1/§3.2).
--
-- PAYMENT PROVIDER (open decision #2, no user available mid-build --
-- FLAG FOR CONFIRMATION): defaulted to RevenueCat over Stripe. Rationale:
-- this is a React Native/Expo app shipping to the App Store/Play Store;
-- native in-app-purchase is the standard (and, for iOS, effectively
-- required by App Store review policy for digital subscriptions) path for
-- mobile subscription products, and RevenueCat is purpose-built to sit in
-- front of StoreKit/Play Billing and normalize their webhooks. Stripe would
-- require either a web checkout escape-hatch (App Store review risk for a
-- pure content/service subscription) or reimplementing StoreKit/Play
-- Billing receipt validation by hand.
--
-- This migration builds the SERVER-SIDE half of that integration: an
-- idempotency ledger + a security-definer RPC the revenuecat-webhook Edge
-- Function calls to flip profiles.subscription_tier. It does not depend on
-- an actual RevenueCat account existing -- it's the receiving end of a
-- webhook that will start arriving for real once RevenueCat is configured
-- (see DEFERRED-EXTERNAL-ACTIONS.md addition in this section's report).
--
-- Idempotency matters here for the same reason atomicity mattered for the
-- stack cap: webhook delivery is at-least-once, not exactly-once (RevenueCat
-- explicitly documents retried/duplicate deliveries). Applying the same
-- event twice is harmless for a straight tier assignment, but the ledger
-- also gives an audit trail (which event caused which tier flip) and a
-- single place to add per-event side effects later without re-deriving
-- "have I seen this before."

create table if not exists subscription_events (
  event_id text primary key, -- RevenueCat event.id -- dedupe key
  user_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  applied_tier text,
  raw_payload jsonb,
  processed_at timestamptz not null default now()
);

alter table subscription_events enable row level security;
-- Server-only table (no policies): the webhook Edge Function reads/writes
-- this exclusively via the service_role client, same as chat_rate_limit
-- (0019) and priority_alerts_sent (0022). authenticated gets nothing back
-- at the RLS layer even though table-level grants exist from the Section 1
-- `alter default privileges` fix.

create index if not exists subscription_events_user_id_idx on subscription_events(user_id);

-- Loosen the implicit free/premium/individual/school contract into an
-- explicit CHECK -- this migration is the first thing writing these columns
-- from an external, un-typed payload (a webhook body), so a malformed event
-- should fail loudly at the DB layer rather than silently writing garbage
-- into a column three other Edge Functions (chat, score-match,
-- stack_opportunity) gate on.
alter table profiles drop constraint if exists profiles_subscription_tier_check;
alter table profiles add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'premium'));

alter table profiles drop constraint if exists profiles_subscription_source_check;
alter table profiles add constraint profiles_subscription_source_check
  check (subscription_source in ('individual', 'school'));

-- Atomically records the event (dedup via primary key) and, only on first
-- sight of this event_id, updates the profile's tier. security definer so
-- current_user inside is the function owner, not 'authenticated' or
-- 'service_role' -- either way this is a structurally-guaranteed non-client
-- write path, same reasoning as increment_stack_count (0008) and
-- stack_opportunity (0020): the 0012 trigger only blocks
-- current_user = 'authenticated', and this function is never invoked as
-- 'authenticated' (only the webhook's service_role client calls it).
create or replace function public.apply_subscription_event(
  p_event_id text,
  p_user_id uuid,
  p_event_type text,
  p_new_tier text,
  p_source text default 'individual',
  p_raw jsonb default '{}'::jsonb
)
returns boolean -- true if this event was newly applied, false if a duplicate delivery
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_tier not in ('free', 'premium') then
    raise exception 'invalid subscription tier: %', p_new_tier;
  end if;

  insert into subscription_events (event_id, user_id, event_type, applied_tier, raw_payload)
  values (p_event_id, p_user_id, p_event_type, p_new_tier, p_raw)
  on conflict (event_id) do nothing;

  if not found then
    return false;
  end if;

  update profiles
  set subscription_tier = p_new_tier,
      subscription_source = coalesce(p_source, subscription_source)
  where id = p_user_id;

  return true;
end;
$$;

grant execute on function public.apply_subscription_event(text, uuid, text, text, text, jsonb) to service_role;
