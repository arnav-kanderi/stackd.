/**
 * Demographic collection field options (spec §2.1, build-plan §3).
 *
 * Grade options are locked to the exact string tokens used in
 * `opportunities.eligibility_grade` (seed_opportunities.sql) so
 * src/lib/match-score.ts's exact-match grade check can actually succeed —
 * '9th'..'12th' cover high schoolers, 'Freshman'/'Sophomore' cover the two
 * college-year values the seed data uses. 'Other' is provided for students
 * who don't fit those (junior/senior in college, gap year, etc.) — it won't
 * satisfy grade-restricted eligibility checks but doesn't block onboarding.
 *
 * Grade and location are required in the UI (spec: "eligibility filtering
 * depends heavily on them"). Gender, citizenship_status, and gpa are
 * presented as clearly optional — do not make these required fields.
 */

export const GRADE_OPTIONS = [
  '9th',
  '10th',
  '11th',
  '12th',
  'Freshman',
  'Sophomore',
  'Junior',
  'Senior',
  'Other',
] as const;

export const GENDER_OPTIONS = [
  'Female',
  'Male',
  'Non-binary',
  'Prefer to self-describe',
  'Prefer not to say',
] as const;

export const CITIZENSHIP_OPTIONS = [
  'US Citizen',
  'Permanent Resident',
  'International Student',
  'Other',
  'Prefer not to say',
] as const;
