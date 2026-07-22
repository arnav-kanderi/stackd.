-- stackd. Section 4 (post-review fix) — recommendation_contacts.status had
-- no DB-level constraint, just a client-side TypeScript union (erased at
-- runtime, trivially bypassed by a direct API call). RLS already confines
-- writes to the caller's own row, so this was data-integrity risk, not a
-- cross-user security issue — a garbage status could break vault.tsx's
-- CONTACT_STATUS_CYCLE indexOf-based cycling logic. Mirrors the doc_type
-- CHECK constraint from 0014.

alter table recommendation_contacts
  add constraint recommendation_contacts_status_check
  check (status in ('not_requested', 'requested', 'received'));
