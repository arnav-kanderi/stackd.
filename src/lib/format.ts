import { labelForRequirement } from '@/lib/checklist';
import type { Opportunity } from '@/lib/types';

/**
 * opportunity.link is currently admin-curated seed data only, but validate
 * the scheme before handing it to WebBrowser regardless — if this field
 * ever becomes attacker-influenced (e.g. a future "suggest an opportunity"
 * path), an unvalidated javascript:/data: scheme would be a real risk.
 */
export function isSafeHttpUrl(link: string | null | undefined): link is string {
  if (!link) return false;
  return /^https?:\/\//i.test(link);
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'No deadline listed';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Eligibility lines — "whichever apply" per spec §2.2, skip fields that are null. */
export function eligibilityLines(opportunity: Opportunity): string[] {
  const lines: string[] = [];
  if (opportunity.eligibility_grade && opportunity.eligibility_grade.length > 0) {
    lines.push(`Grade: ${opportunity.eligibility_grade.join(', ')}`);
  }
  if (opportunity.eligibility_citizenship) {
    lines.push(`Citizenship: ${opportunity.eligibility_citizenship}`);
  }
  if (opportunity.eligibility_gpa_min != null) {
    lines.push(`GPA: ${opportunity.eligibility_gpa_min}+`);
  }
  if (opportunity.eligibility_location) {
    lines.push(`Location: ${opportunity.eligibility_location}`);
  }
  if (opportunity.eligibility_other) {
    lines.push(opportunity.eligibility_other);
  }
  if (lines.length === 0) {
    lines.push('Open eligibility — no stated restrictions');
  }
  return lines;
}

export function applicationRequirementLabels(opportunity: Opportunity): string[] {
  return (opportunity.application_requirements ?? []).map(labelForRequirement);
}
