-- stackd. Section 6 — Application strategy suggestions (spec §3.1 premium
-- feature, build-plan item 3). Premium-only, per-opportunity resume/
-- application feedback generated from Section 4's already-parsed vault
-- content (user_documents.parsed_content) + the opportunity's stated
-- requirements. Cached the same way score-match caches Stage-2 (0014's
-- match_inputs_hash pattern) so re-opening the Prep view for an unchanged
-- profile/opportunity doesn't re-call Claude.

alter table stack_items add column if not exists strategy_suggestions jsonb;
alter table stack_items add column if not exists strategy_inputs_hash text;
alter table stack_items add column if not exists strategy_computed_at timestamptz;
