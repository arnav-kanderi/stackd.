import type { ApplicationRequirement } from '@/lib/types';

/**
 * Estimated completion time (spec §2.4, build-plan item 6): a DETERMINISTIC
 * heuristic derived from application_requirements -- explicitly not an AI
 * call, per the same cost-discipline rule as everything else non-essential.
 *
 * opportunities.est_completion_time is manually curated at CSV-import time
 * (spec §4 "opportunity sourcing"); this heuristic is the fallback used
 * whenever that field is null, and the same formula the curation team can
 * sanity-check their manual entries against.
 *
 * Per-requirement minute weights, roughly calibrated to the spec's own
 * examples ("resume + 2 essays ~5hrs" / "single form ~30min"):
 *   resume ~30min (assemble/attach), transcript ~10min (mostly a request +
 *   upload), essay ~120min (the dominant cost driver), activity_list ~20min,
 *   recommendation_letter ~15min (requesting it, not writing it).
 * A bare opportunity with zero stated requirements still costs ~15min for
 * the base application form itself.
 */
const REQUIREMENT_MINUTES: Record<ApplicationRequirement, number> = {
  resume: 30,
  transcript: 10,
  essay: 120,
  activity_list: 20,
  recommendation_letter: 15,
};

const BASE_FORM_MINUTES = 15;

export function estimateCompletionMinutes(requirements: string[] | null | undefined): number {
  const reqs = requirements ?? [];
  const total = reqs.reduce((sum, req) => sum + (REQUIREMENT_MINUTES[req as ApplicationRequirement] ?? 20), 0);
  return BASE_FORM_MINUTES + total;
}

export function formatCompletionMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 2) / 2; // nearest half hour
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} hr${rounded === 1 ? '' : 's'}`;
}

/** Prefer the curated value; fall back to the deterministic heuristic. */
export function estimatedCompletionTimeFor(opportunity: {
  est_completion_time: string | null;
  application_requirements: string[] | null;
}): string {
  if (opportunity.est_completion_time) return opportunity.est_completion_time;
  return formatCompletionMinutes(estimateCompletionMinutes(opportunity.application_requirements));
}
