-- stackd. Section 7 (Polish) — persistent per-document parse-failure state.
--
-- Section 4's vault upload flow already surfaces a parse failure once, via a
-- client-side Alert.alert at upload time (src/lib/vault.ts). That's a real
-- gap against this section's "graceful AI-failure degraded state" bar: once
-- the alert is dismissed (or the app is reopened), the document row only
-- ever showed "parsed" vs "not parsed yet" -- there was no way to tell "we
-- haven't tried yet" apart from "we tried and it failed," which silently
-- looks identical to a document that's simply queued.
--
-- This column lets parse-document (Edge Function) persist *why* parsing
-- didn't happen, so the Vault screen can render a real per-document error
-- state ("Parsing failed: ...") instead of just "not parsed yet" forever.
-- Cleared back to null on the next successful parse (re-upload triggers a
-- fresh row anyway, per parse-document's header comment, but this also
-- covers a hypothetical future retry-in-place path).

alter table user_documents
  add column if not exists parsed_content_error text;

comment on column user_documents.parsed_content_error is
  'Human-readable reason the most recent parse attempt failed (e.g. ANTHROPIC_API_KEY missing, download error, Claude error). Null when parsing has never been attempted or last succeeded. Distinct from parsed_content IS NULL, which is also true for "never attempted."';
