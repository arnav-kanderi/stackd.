-- stackd. Section 4 — Document Vault + AI Matching schema additions.
-- Tables themselves (user_documents, recommendation_contacts, stack_items)
-- already exist from 0001_schema.sql with RLS from 0006. This migration adds:
--   1. A CHECK constraint locking user_documents.doc_type to the 4 values
--      the checklist mapping (src/lib/checklist.ts) already assumes.
--   2. Indexes for the lookups the vault UI and Prep popup do per-user.
--   3. Stage-2 match-score bookkeeping columns on stack_items: match_stage
--      distinguishes a Stage-1 (deterministic, free) row from a Stage-2
--      (AI-reasoned) row so the free/premium display branch and the cache
--      logic both have something concrete to check. match_inputs_hash is a
--      fingerprint of (profile core fields + opportunity requirements +
--      vault doc updated_at timestamps) — Stage-2 recompute is triggered
--      only when this hash changes, never on a schedule.

alter table user_documents
  add constraint user_documents_doc_type_check
  check (doc_type in ('resume', 'transcript', 'essay', 'activity_list'));

create index if not exists user_documents_user_doctype_idx
  on user_documents (user_id, doc_type);

create index if not exists recommendation_contacts_user_idx
  on recommendation_contacts (user_id);

alter table stack_items
  add column if not exists match_stage text default 'stage1'
    check (match_stage in ('stage1', 'stage2')),
  add column if not exists match_inputs_hash text,
  add column if not exists match_computed_at timestamptz;

comment on column stack_items.match_stage is
  'stage1 = free deterministic score (Section 2). stage2 = AI-reasoned score with acceptance likelihood (Section 4), premium-only for display.';
comment on column stack_items.match_inputs_hash is
  'Fingerprint of profile+opportunity+vault-doc state used to invalidate the Stage-2 cache. Recompute only when this changes.';
