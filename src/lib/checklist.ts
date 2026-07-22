import type { ApplicationRequirement } from '@/lib/types';

/**
 * application_requirements -> checklist task_name mapping (build-plan §
 * "Checklist items"). Locked here per spec §2.5 step 2's instruction to
 * lock the requirement->doc_type mapping before building the Prep screen.
 * Also doubles as the doc_type -> vault section mapping the Prep popup stub
 * uses in Section 2 (full vault wiring is Section 4).
 */
export const REQUIREMENT_TASK_NAMES: Record<string, string> = {
  resume: 'Resume Uploaded',
  transcript: 'Transcript Uploaded',
  essay: 'Essay Complete',
  activity_list: 'Activities List Complete',
  recommendation_letter: 'Need Recommendation',
};

export const REQUIREMENT_LABELS: Record<string, string> = {
  resume: 'Resume',
  transcript: 'Transcript',
  essay: 'Essay',
  activity_list: 'Activities List',
  recommendation_letter: 'Recommendation Letter',
};

export function taskNameForRequirement(requirement: string): string {
  return REQUIREMENT_TASK_NAMES[requirement] ?? `${requirement} Complete`;
}

export function labelForRequirement(requirement: string): string {
  return REQUIREMENT_LABELS[requirement] ?? requirement;
}

export function isKnownRequirement(requirement: string): requirement is ApplicationRequirement {
  return requirement in REQUIREMENT_TASK_NAMES;
}

export function checklistPercent(items: { is_complete: boolean }[] | null | undefined): number {
  const total = items?.length ?? 0;
  if (total === 0) return 0;
  const done = items!.filter((i) => i.is_complete).length;
  return Math.round((done / total) * 100);
}
