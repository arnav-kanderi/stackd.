/**
 * Locked interest-tag vocabulary shared by both onboarding paths that need
 * to populate profiles.interest_tags: the "Fill out my info" tag picker
 * (src/components/onboarding/tag-picker-screen.tsx) and LinkedIn's
 * confirm_tags phase (src/components/onboarding/linkedin-connect-screen.tsx)
 * -- both render src/components/onboarding/tag-selector.tsx against this
 * list.
 *
 * This file originally also held a multi-question career exam (a locked
 * question set + deterministic answer -> tags mapping) that was the
 * onboarding default before the 2026-07-22 redesign replaced it with a
 * direct tag picker. That quiz content was removed as dead code once nothing
 * referenced it -- the vocabulary below is the only piece still in use.
 *
 * TAG VOCABULARY IS LOCKED against the actual values used in
 * supabase/seed/seed_opportunities.sql's `interest_tags` columns (verified by
 * reading that file directly — see the full list below). Every tag here
 * appears in at least one seeded opportunity, so Stage-1 tag overlap in
 * src/lib/match-score.ts always has something to match against.
 *
 * Seed vocabulary (union across all 9 seed rows, verified 2026-07-20):
 *   Business, Entrepreneurship, Leadership, Software Engineering,
 *   Computer Science, Technology, Community Service, Robotics, Engineering,
 *   Teamwork, STEM, Customer Service, Retail, Coding, Diversity in Tech,
 *   Science, Research, Finance, Investment Banking, Resilience
 *
 * Do not add a tag to this list unless it also exists in that seed
 * vocabulary — an unmapped tag would silently be unmatchable in Stage-1
 * scoring for anyone who picks it.
 */

export const LOCKED_INTEREST_TAGS = [
  'Business',
  'Entrepreneurship',
  'Leadership',
  'Software Engineering',
  'Computer Science',
  'Technology',
  'Community Service',
  'Robotics',
  'Engineering',
  'Teamwork',
  'STEM',
  'Customer Service',
  'Retail',
  'Coding',
  'Diversity in Tech',
  'Science',
  'Research',
  'Finance',
  'Investment Banking',
  'Resilience',
] as const;

export type LockedInterestTag = (typeof LOCKED_INTEREST_TAGS)[number];
