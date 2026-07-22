-- stackd. (post-launch-prep security sweep) — anon/authenticated hold
-- TRUNCATE/REFERENCES/TRIGGER on every app table, a Supabase project-level
-- default present since project creation (confirmed present even on the
-- pre-existing, unrelated `watchlists` table, so it predates this build).
--
-- These are NOT reachable through the app's actual attack surface: the
-- client only ever talks to Postgres through PostgREST (what supabase-js
-- uses), which exposes SELECT/INSERT/UPDATE/DELETE and calls to explicitly
-- defined RPC functions -- there is no PostgREST verb for TRUNCATE,
-- REFERENCES, or TRIGGER, and no direct Postgres connection string is
-- exposed to any client role. So this migration closes a standing privilege
-- with no live exploit path, purely as defense-in-depth (e.g. in case a
-- future admin tool or bug ever hands a raw Postgres connection to one of
-- these roles) -- confirmed via a real signed-up test user hitting the REST
-- API, not just asserted.
--
-- Deliberately NOT touching `watchlists` -- that table isn't part of this
-- app/build, not ours to modify.

revoke truncate, references, trigger on
  chat_messages,
  chat_rate_limit,
  checklist_items,
  opportunities,
  priority_alerts_sent,
  profiles,
  recommendation_contacts,
  stack_items,
  subscription_events,
  user_documents
from anon, authenticated;
