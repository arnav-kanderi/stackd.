/**
 * Shared domain types mirroring the Supabase schema (spec §5).
 * Kept hand-written rather than generated since Section 3+ will extend
 * profiles (onboarding) and Section 4 will extend user_documents (vault).
 */

export type OpportunityCategory =
  | 'Internship'
  | 'Summer Program'
  | 'Job'
  | 'Competition'
  | 'Scholarship';

export type ApplicationRequirement =
  | 'resume'
  | 'transcript'
  | 'essay'
  | 'activity_list'
  | 'recommendation_letter';

export interface Opportunity {
  id: string;
  name: string;
  category: string;
  description: string | null;
  link: string | null;
  logo_url: string | null;
  deadline: string | null; // date, e.g. "2026-11-15"
  eligibility_grade: string[] | null;
  eligibility_citizenship: string | null;
  eligibility_gpa_min: number | null;
  eligibility_location: string | null;
  eligibility_other: string | null;
  interest_tags: string[] | null;
  est_completion_time: string | null;
  application_requirements: string[] | null;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  grade: string | null;
  location: string | null;
  gender: string | null;
  citizenship_status: string | null;
  gpa: number | null;
  interest_tags: string[] | null;
  career_exam_results: unknown;
  linkedin_imported: boolean;
  subscription_tier: 'free' | 'premium';
  subscription_source: 'individual' | 'school';
  stack_count: number;
  expo_push_token: string | null;
  created_at: string;
}

/** The 5 statuses from spec §2.5 — order matters for the My Stack dashboard. */
export const STACK_STATUSES = [
  'Saved',
  'In Progress',
  'Ready to Submit',
  'Due Soon',
  'Stackd',
] as const;

export type StackStatus = (typeof STACK_STATUSES)[number];

export interface MatchBreakdownTag {
  label: string;
  met: boolean;
}

export interface MatchBreakdown {
  tags: MatchBreakdownTag[];
  eligibility: MatchBreakdownTag[];
}

export interface StackItem {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: StackStatus;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
  match_stage: 'stage1' | 'stage2';
  match_inputs_hash: string | null;
  match_computed_at: string | null;
  estimated_acceptance: 'High' | 'Medium' | 'Low' | null;
  created_at: string;
  last_notified_at: string | null;
  // Section 6 — premium application strategy suggestions (see
  // src/lib/strategy.ts), cached the same way match_score/match_breakdown
  // are for Stage-2.
  strategy_suggestions: unknown | null;
  strategy_inputs_hash: string | null;
  strategy_computed_at: string | null;
  // joined
  opportunity?: Opportunity;
}

export interface ChecklistItem {
  id: string;
  stack_item_id: string;
  task_name: string;
  is_complete: boolean;
}
