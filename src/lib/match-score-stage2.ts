import { invokeEdgeFunction } from '@/lib/functions';
import type { MatchBreakdown, Profile } from '@/lib/types';

export interface Stage2Result {
  cached: boolean;
  match_score: number;
  match_breakdown: MatchBreakdown;
  estimated_acceptance: 'High' | 'Medium' | 'Low' | null;
}

// Server-side (score-match/index.ts) is the authoritative gate -- this is
// only call-avoidance on the client, not a security boundary. Shared here
// so the three client-side call sites (stack-actions.ts, prep-modal.tsx,
// and this module) can't drift on what "premium" means.
export function isPremium(profile: Pick<Profile, 'subscription_tier'> | null): boolean {
  return profile?.subscription_tier === 'premium';
}

/**
 * Client-side trigger for the Stage-2 AI match score (spec §2.3 Stage 2,
 * build-plan item 3). All the actual work -- the Claude call, the cache
 * check against match_inputs_hash, the premium gate -- lives server-side
 * in the score-match Edge Function so the API key never ships to the
 * client and the cache check can't be bypassed by calling this twice in a
 * row from the client.
 *
 * Call sites (must match build-plan trigger logic exactly):
 *   1. lib/stack-actions.ts `stackOpportunity()` -- fires once right after
 *      a premium user taps "Stack It".
 *   2. Opening the Prep popup / match-detail view for an already-stacked
 *      item -- the Edge Function's own cache check makes this a no-op
 *      (no Claude call) unless inputs actually changed since the last run.
 * Never call this from feed-card render/scroll.
 */
export async function requestStage2Score(stackItemId: string): Promise<{ result: Stage2Result | null; error: string | null }> {
  const { data, error } = await invokeEdgeFunction<Stage2Result>('score-match', { stackItemId });
  return { result: data, error };
}
