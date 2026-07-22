-- stackd. Section 2 (post-review fix) — stop the recurring "forgot to grant
-- privileges on a new table" bug (0004_grants.sql fixed it for authenticated,
-- 0010_service_role_grants.sql fixed it again for service_role — same class
-- of bug twice). `alter default privileges` makes every FUTURE table created
-- in schema public by this migration role automatically grant CRUD to both
-- authenticated and service_role, so a Section 3+ migration that adds a new
-- table can't reintroduce this gap by omission.
--
-- RLS remains the real access boundary (see 0002_rls.sql/0006_policy_
-- consolidation.sql) — this only controls whether the underlying Postgres
-- privilege exists at all, same as every grant in 0004/0010. A future
-- read-only-for-client table (like opportunities) still needs an explicit
-- `revoke insert, update, delete on <table> from authenticated` alongside
-- its RLS policy, same as opportunities does today.

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
