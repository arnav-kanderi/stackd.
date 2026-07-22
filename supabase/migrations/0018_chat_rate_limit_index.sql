-- stackd. Section 5 (post-review fix) — the (user_id, created_at) index from
-- 0017 fully covers the history query (all roles, ordered by created_at),
-- but the rate-limit COUNT query filters on role = 'user' too, which that
-- index can't apply until after the index scan. A single 3-column
-- (user_id, role, created_at) composite would fix the COUNT query but break
-- the history query's use of the index for ordering (role would sit between
-- user_id and created_at in the btree, splitting the created_at ordering
-- across two role groups). A partial index scoped to role='user' rows gets
-- both: the original (user_id, created_at) index still fully serves the
-- unfiltered history fetch, and this one makes the COUNT query fully
-- index-covered.

create index if not exists chat_messages_user_created_user_role_idx
  on chat_messages (user_id, created_at)
  where role = 'user';
