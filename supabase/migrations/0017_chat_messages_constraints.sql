-- stackd. Section 5 (Chatbot) — chat_messages already exists (0001_schema.sql)
-- with correct RLS (0006_policy_consolidation.sql: single "own rows" `for
-- all` policy) and a user_id index (0005_indexes.sql). This migration only
-- adds what Section 5 specifically needs:
--   1. A CHECK constraint on role, mirroring the pattern used for other
--      free-text-that's-really-an-enum columns (0013, 0016) -- the Edge
--      Function only ever writes 'user'/'assistant', but a DB-level
--      constraint stops a bad row from silently corrupting history/rate
--      limit counting.
--   2. A composite (user_id, created_at) index -- the chat Edge Function's
--      two hot queries are both `where user_id = ? and created_at >= ?`
--      (today's rate-limit count) and `where user_id = ? order by
--      created_at` (recent history for context) -- the existing
--      user_id-only index doesn't sort/filter on created_at efficiently.

alter table chat_messages
  add constraint chat_messages_role_check check (role in ('user', 'assistant'));

create index if not exists chat_messages_user_created_idx on chat_messages (user_id, created_at);
