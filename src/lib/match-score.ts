import type { MatchBreakdown, Opportunity, Profile } from '@/lib/types';

/**
 * Stage-1 deterministic match score (spec §2.3, build-plan §"Stage-1 match
 * score formula"). Free, instant, no AI call:
 *   - tag overlap between profile.interest_tags and opportunity.interest_tags
 *   - hard eligibility checks: grade, citizenship, GPA, location
 *
 * Weighted 60% tag overlap / 40% eligibility so an opportunity with zero
 * stated eligibility criteria isn't unfairly capped, while opportunities the
 * student is flatly ineligible for still score visibly lower.
 *
 * Returns a 0-100 integer percentage plus a ✓/✗ breakdown in the format
 * shown in the spec §2.3 example block. No "estimated acceptance" field —
 * that requires Stage-2 AI reasoning (out of scope for this section).
 */
export interface MatchResult {
  score: number;
  breakdown: MatchBreakdown;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function computeMatchScore(profile: Profile | null, opportunity: Opportunity): MatchResult {
  const profileTags = (profile?.interest_tags ?? []).map(norm);
  const oppTags = opportunity.interest_tags ?? [];

  const tagBreakdown = oppTags.map((tag) => ({
    label: tag,
    met: profileTags.includes(norm(tag)),
  }));
  const tagMatchCount = tagBreakdown.filter((t) => t.met).length;
  const tagRatio = oppTags.length > 0 ? tagMatchCount / oppTags.length : 0;

  const eligibility: MatchBreakdown['eligibility'] = [];

  // Grade
  if (opportunity.eligibility_grade && opportunity.eligibility_grade.length > 0) {
    const met = !!profile?.grade && opportunity.eligibility_grade.some((g) => norm(g) === norm(profile.grade));
    eligibility.push({ label: `Grade: ${opportunity.eligibility_grade.join(', ')}`, met });
  }

  // Citizenship
  if (opportunity.eligibility_citizenship) {
    const met = norm(profile?.citizenship_status) === norm(opportunity.eligibility_citizenship);
    eligibility.push({ label: opportunity.eligibility_citizenship, met });
  }

  // GPA
  if (opportunity.eligibility_gpa_min != null) {
    const met = profile?.gpa != null && profile.gpa >= opportunity.eligibility_gpa_min;
    eligibility.push({ label: `GPA Requirement Met (${opportunity.eligibility_gpa_min}+)`, met });
  }

  // Location
  if (opportunity.eligibility_location) {
    const oppLoc = norm(opportunity.eligibility_location);
    const profileLoc = norm(profile?.location);
    const met =
      oppLoc.includes('nationwide') ||
      oppLoc.includes('remote') ||
      (!!profileLoc && (oppLoc.includes(profileLoc) || profileLoc.includes(oppLoc)));
    eligibility.push({ label: opportunity.eligibility_location, met });
  }

  const eligibilityMetCount = eligibility.filter((e) => e.met).length;
  const eligibilityRatio = eligibility.length > 0 ? eligibilityMetCount / eligibility.length : 1;

  const score = Math.round((tagRatio * 0.6 + eligibilityRatio * 0.4) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { tags: tagBreakdown, eligibility },
  };
}
