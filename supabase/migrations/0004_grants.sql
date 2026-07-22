-- stackd. Section 1 — role grants
-- RLS policies only take effect once the calling role has the underlying
-- Postgres privilege on the table; without GRANTs, Postgres denies access
-- before RLS is ever evaluated. Grant privileges to `authenticated`, then let
-- RLS (0002_rls.sql) narrow which rows are actually visible/writable.

grant usage on schema public to authenticated;

-- opportunities: read-only for authenticated clients, no write grants at all
-- (matches the "no insert/update/delete policy for the client role" rule).
grant select on opportunities to authenticated;

-- user-owned tables: full CRUD privilege, narrowed to own rows by RLS policies.
grant select, insert, update, delete on profiles to authenticated;
grant select, insert, update, delete on user_documents to authenticated;
grant select, insert, update, delete on recommendation_contacts to authenticated;
grant select, insert, update, delete on stack_items to authenticated;
grant select, insert, update, delete on checklist_items to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;

-- allow the security-definer helper function to be invoked by authenticated callers
grant execute on function public.owns_stack_item(uuid) to authenticated;
