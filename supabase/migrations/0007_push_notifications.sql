-- stackd. Section 2 — push notification support
-- Additive only: does not touch any column from the locked spec §5 schema.
-- expo_push_token: where we store the student's Expo push token once they
--   grant notification permission (set by the client via the existing "own
--   profile" RLS policy — no new policy needed).
-- last_notified_at: dedupe guard so the daily deadline-check Edge Function
--   doesn't re-send a push every day for the same approaching deadline.

alter table profiles
  add column if not exists expo_push_token text;

alter table stack_items
  add column if not exists last_notified_at timestamp;
