-- stackd. Section 5 (post-review security fix) — the chat rate limit was a
-- plain "COUNT today's rows, then later INSERT" with no locking. Concurrent
-- requests from the same user all read the same pre-insert count, all pass
-- the cap check, and all proceed to a real (billed) Claude call before any
-- of them has persisted a row -- an uncapped-in-practice spend multiplier
-- bounded only by client concurrency, not by the stated daily cap.
--
-- Fix: a dedicated counter table with an atomic "insert or conditionally
-- increment" reserved via ON CONFLICT ... WHERE ... RETURNING, which
-- Postgres serializes at the row level on the (user_id, day) primary key --
-- concurrent callers for the same user genuinely queue rather than racing.
--
-- This table is server-only: RLS is enabled with zero policies, so
-- `authenticated` (which still gets table-level grants from the Section 1
-- `alter default privileges` fix) gets nothing back at the RLS layer.
-- service_role bypasses RLS entirely (as it already does for every other
-- table these Edge Functions touch), so no exception is needed there.

create table if not exists chat_rate_limit (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table chat_rate_limit enable row level security;

-- Atomically reserve one message against the cap. Returns the new count on
-- success, or NULL if the cap was already reached (the ON CONFLICT ...
-- WHERE clause blocks the update, so RETURNING yields zero rows and this
-- scalar-returning SQL function returns NULL for that case).
create or replace function public.reserve_chat_message(p_user_id uuid, p_cap int)
returns int
language sql
as $$
  insert into chat_rate_limit (user_id, day, count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set count = chat_rate_limit.count + 1
  where chat_rate_limit.count < p_cap
  returning count;
$$;

-- Best-effort refund when a reservation was made but no Claude call actually
-- happened (missing key) or the call itself failed -- so an outage/missing
-- config doesn't burn the user's daily quota. Not itself required for
-- atomicity (that's reserve_chat_message's job); a race on the refund path
-- only risks a minor undercount, never letting a user exceed the cap.
create or replace function public.release_chat_message(p_user_id uuid)
returns void
language sql
as $$
  update chat_rate_limit
  set count = greatest(count - 1, 0)
  where user_id = p_user_id and day = (now() at time zone 'utc')::date;
$$;

grant execute on function public.reserve_chat_message(uuid, int) to service_role;
grant execute on function public.release_chat_message(uuid) to service_role;

-- The rate limit no longer counts off chat_messages, so the partial index
-- added in 0018 for that COUNT query has nothing left to serve.
drop index if exists chat_messages_user_created_user_role_idx;
