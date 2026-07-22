import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

/**
 * All onboarding writes go through `upsert` rather than `update`: a signed-up
 * user has no `profiles` row yet (no DB trigger creates one on
 * auth.users insert — confirmed by reading migrations 0001-0012), so the
 * first onboarding write must be able to INSERT. RLS policies "insert own
 * profile" and "update own profile" (0002_rls.sql) both key off
 * auth.uid() = id, so upsert-by-id works for both the create and
 * update-in-place cases.
 *
 * None of the columns written here (grade, location, gender,
 * citizenship_status, gpa, interest_tags, linkedin_imported) are protected
 * by the profiles trigger from 0012_protect_profile_columns.sql — only
 * subscription_tier, subscription_source, and stack_count are. Safe to write
 * directly.
 */

export interface DemographicsInput {
  grade: string;
  location: string;
  gender?: string | null;
  citizenship_status?: string | null;
  gpa?: number | null;
}

// No .select() on these writes: every caller only checks {error} (the fresh
// profile is re-fetched by useProfile().refresh() after onFinished()), so
// returning the updated row would just be a discarded round-trip payload on
// every onboarding write.

export async function saveDemographics(userId: string, input: DemographicsInput) {
  return supabase.from('profiles').upsert({
    id: userId,
    grade: input.grade,
    location: input.location,
    gender: input.gender ?? null,
    citizenship_status: input.citizenship_status ?? null,
    gpa: input.gpa ?? null,
  });
}

/**
 * Shared interest_tags writer (2026-07-22 onboarding redesign): both the
 * LinkedIn confirm-tags step and the new required tag-picker step write
 * profiles.interest_tags the same way -- only `linkedin_imported` differs.
 * Extracted so the two callers can't silently drift on the write shape.
 */
async function saveInterestTagsInternal(userId: string, tags: string[], linkedinImported: boolean) {
  return supabase.from('profiles').upsert({
    id: userId,
    interest_tags: tags,
    linkedin_imported: linkedinImported,
  });
}

export async function saveLinkedInImport(userId: string, tags: string[]) {
  return saveInterestTagsInternal(userId, tags, true);
}

/**
 * New onboarding tag-picker step (replaces the career exam as the source of
 * profiles.interest_tags for the "Fill out my info" path). Required,
 * >=1 tag enforced by the screen before calling this -- Stage-1 match
 * scoring (src/lib/match-score.ts) needs at least some tags to ever produce
 * a non-zero score.
 */
export async function saveOnboardingTags(userId: string, tags: string[]) {
  return saveInterestTagsInternal(userId, tags, false);
}

/**
 * Onboarding is "complete" once the two effectively-required fields (grade,
 * location) are set and interest_tags has been populated by either path
 * (the required tag picker or LinkedIn import). Used by the root layout to
 * decide whether to show the onboarding flow or the real app tabs.
 */
export function isOnboardingComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  return !!profile.grade && !!profile.location && !!profile.interest_tags && profile.interest_tags.length > 0;
}
