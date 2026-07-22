-- stackd. Section 4 (post-review fix) — score-match was smuggling
-- estimated_acceptance into match_breakdown's JSONB instead of its own
-- column, forcing the client to type-cast match_breakdown differently
-- depending on match_stage. match_stage already exists as a clean
-- discriminator (0014); giving this field its own typed column removes the
-- need for that cast.

alter table stack_items
  add column if not exists estimated_acceptance text
    check (estimated_acceptance is null or estimated_acceptance in ('High', 'Medium', 'Low'));

comment on column stack_items.estimated_acceptance is
  'Stage-2 only (spec §2.3) — Claude''s High/Medium/Low acceptance estimate. Null until a Stage-2 score has been computed.';
