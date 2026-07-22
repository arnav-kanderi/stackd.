-- stackd. Section 2 (bug fix, discovered while wiring the cron Edge
-- Functions) — service_role was missing SELECT/INSERT/UPDATE/DELETE grants
-- on every app table (it only had TRUNCATE/REFERENCES/TRIGGER, presumably
-- left over from whatever bootstrapped this project). service_role bypasses
-- RLS but still needs the underlying table grant — without this, Edge
-- Functions authenticated with the service role key get
-- "permission denied for table X" even though they're using the "God mode"
-- key. Confirmed via information_schema.role_table_grants.

grant select, insert, update, delete on opportunities to service_role;
grant select, insert, update, delete on profiles to service_role;
grant select, insert, update, delete on user_documents to service_role;
grant select, insert, update, delete on recommendation_contacts to service_role;
grant select, insert, update, delete on stack_items to service_role;
grant select, insert, update, delete on checklist_items to service_role;
grant select, insert, update, delete on chat_messages to service_role;
