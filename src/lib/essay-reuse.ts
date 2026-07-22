import type { Opportunity } from '@/lib/types';
import type { VaultDocument } from '@/lib/vault';

/**
 * Essay reuse suggestions (spec §3.1 premium feature, build-plan item 4).
 *
 * SCOPE CALL: the master spec describes this as "surfaces previously
 * written essays from the vault that might fit a new application's
 * prompt." The schema has no field for an opportunity's actual essay
 * *prompt text* (application_requirements is just a flag list — 'essay' —
 * not prompt copy), so a real per-prompt fit assessment isn't something
 * the current data supports without inventing a new opportunity field,
 * which is out of this section's scope (see 06-monetization-gating.md:
 * "if a premium feature seems to need new AI plumbing... stop and check
 * Sections 4-5 first"). Built the lighter, still-genuinely-useful version
 * the build-plan handoff explicitly allows: list the student's existing
 * essays (already parsed in Section 4) for them to review/reuse when this
 * opportunity requires one, ranked by tag overlap with the opportunity so
 * the most topically-relevant essay surfaces first. No new Claude call —
 * this is entirely free, deterministic, and reuses existing vault data,
 * consistent with the spec's cost-discipline framing elsewhere.
 */
export interface EssayReuseCandidate {
  documentId: string;
  storagePath: string;
  overlapScore: number; // 0-1, tag overlap between essay's parsed skills/activities and the opportunity's interest_tags
  updatedAt: string;
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function essayReuseCandidates(documents: VaultDocument[], opportunity: Opportunity): EssayReuseCandidate[] {
  const essays = documents.filter((d) => d.doc_type === 'essay');
  const oppTags = (opportunity.interest_tags ?? []).map(norm);

  return essays
    .map((essay) => {
      const parsedTerms = [
        ...(essay.parsed_content?.skills ?? []),
        ...(essay.parsed_content?.activities ?? []),
      ].map(norm);
      const overlap = oppTags.length > 0 ? parsedTerms.filter((t) => oppTags.includes(t)).length / oppTags.length : 0;
      return {
        documentId: essay.id,
        storagePath: essay.storage_path,
        overlapScore: Math.max(0, Math.min(1, overlap)),
        updatedAt: essay.updated_at,
      };
    })
    .sort((a, b) => b.overlapScore - a.overlapScore);
}
