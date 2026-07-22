-- stackd. Section 1 (post-review fix) — indexes on RLS-filtered columns
-- Every RLS policy from 0002_rls.sql adds auth.uid() = user_id (or the
-- owns_stack_item join) to every query's WHERE clause. Without an index on
-- these columns, RLS-filtered reads force a sequential scan.

create index if not exists user_documents_user_id_idx on user_documents (user_id);
create index if not exists recommendation_contacts_user_id_idx on recommendation_contacts (user_id);
create index if not exists stack_items_user_id_idx on stack_items (user_id);
create index if not exists stack_items_opportunity_id_idx on stack_items (opportunity_id);
create index if not exists chat_messages_user_id_idx on chat_messages (user_id);
create index if not exists checklist_items_stack_item_id_idx on checklist_items (stack_item_id);
