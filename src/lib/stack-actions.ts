import { computeMatchScore } from '@/lib/match-score';
import { isPremium, requestStage2Score } from '@/lib/match-score-stage2';
import { checklistPercent, taskNameForRequirement } from '@/lib/checklist';
import { supabase } from '@/lib/supabase';
import type { ChecklistItem, Opportunity, Profile, StackItem, StackStatus } from '@/lib/types';

export const DUE_SOON_WINDOW_DAYS = 7;

/**
 * Status-column semantics (spec §2.5 only fully specifies Saved -> ... ->
 * Stackd; "Ready to Submit" and "Due Soon" are underspecified, so the
 * mapping locked here is:
 *   - Saved             checklist 0% complete, just stacked
 *   - In Progress        0% < checklist < 100%
 *   - Ready to Submit    checklist === 100%, student hasn't tapped "Stackd" yet
 *   - Stackd             student tapped "Stackd" once at 100%
 *   - Due Soon           a computed OVERLAY for grouping/sorting in My Stack:
 *                        any non-Stackd item whose deadline is within
 *                        DUE_SOON_WINDOW_DAYS, regardless of checklist state.
 *                        Never persisted over the real workflow status so
 *                        checklist logic above keeps working once the
 *                        deadline passes out of the window.
 */
export function effectiveStatus(item: StackItem): StackStatus {
  if (item.status === 'Stackd') return 'Stackd';
  if (isDueSoon(item.opportunity?.deadline ?? null)) return 'Due Soon';
  return item.status;
}

export function isDueSoon(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  const days = daysUntil(deadline);
  return days != null && days >= 0 && days <= DUE_SOON_WINDOW_DAYS;
}

export function daysUntil(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function statusForProgress(percent: number): StackStatus {
  if (percent >= 100) return 'Ready to Submit';
  if (percent > 0) return 'In Progress';
  return 'Saved';
}

/** spec §3.1: free tier "Stack It" up to 10 opportunities total. See
 * migration 0020_stack_cap_atomic.sql for the full counting-logic decision
 * writeup (Decision 1, flagged for user confirmation) — short version: this
 * is a LIVE count of stack_items, not a lifetime counter. Un-stacking frees
 * a slot; completing ("Stackd") does not. */
export const FREE_TIER_STACK_CAP = 10;

export interface StackResult {
  error: string | null;
  /** true when this attempt was rejected by the 10-item free-tier cap — the
   * caller (feed screen) shows the paywall modal instead of an error toast. */
  paywalled: boolean;
}

/**
 * spec §2.3 / build-plan "Cache the score": Stage-1 score is computed on
 * the fly for feed display, but only written to stack_items once the
 * student actually stacks the item.
 *
 * Cap enforcement + the actual insert happen ATOMICALLY server-side via the
 * stack_opportunity() RPC (migration 0020) — this is NOT a client-side
 * "count then insert," which would have the exact TOCTOU race Section 5's
 * chat rate limit had (see WORKFLOW-AND-STATE.md). Stage-1 scoring still
 * happens client-side before the call (cheap, deterministic, no waste even
 * if blocked), but Stage-2 (AI) and checklist rows are only created AFTER
 * the RPC confirms the item was actually saved — an attempted-but-blocked
 * 11th item never reaches either.
 */
export async function stackOpportunity(
  userId: string,
  opportunity: Opportunity,
  profile: Profile | null
): Promise<StackResult> {
  const { score, breakdown } = computeMatchScore(profile, opportunity);

  const { data, error: rpcError } = await supabase
    .rpc('stack_opportunity', {
      p_user_id: userId,
      p_opportunity_id: opportunity.id,
      p_match_score: score,
      p_match_breakdown: breakdown,
      p_cap: FREE_TIER_STACK_CAP,
    })
    .single();

  if (rpcError) {
    // unique(user_id, opportunity_id) violation reads as a Postgres error
    // here, not a paywall — surface it as a normal error.
    return { error: rpcError.message, paywalled: false };
  }

  const result = data as { stack_item_id: string | null; blocked: boolean };
  if (result.blocked || !result.stack_item_id) {
    return { error: null, paywalled: true };
  }

  const stackItemId = result.stack_item_id;
  const requirements = opportunity.application_requirements ?? [];

  if (requirements.length > 0) {
    const { error: checklistError } = await supabase.from('checklist_items').insert(
      requirements.map((req) => ({
        stack_item_id: stackItemId,
        task_name: taskNameForRequirement(req),
        is_complete: false,
      }))
    );
    if (checklistError) {
      return { error: checklistError.message, paywalled: false };
    }
  }

  // Stage-2 AI match score (spec §2.3 Stage 2): the ONE point this section
  // triggers it from besides a bounded top-N precompute -- never on feed
  // scroll. Premium-only (free sees Stage-1 only); failure here (missing
  // API key, network) never fails the stack action itself, since Stage-1's
  // score is already saved and usable.
  if (isPremium(profile)) {
    void requestStage2Score(stackItemId);
  }

  return { error: null, paywalled: false };
}

/**
 * Un-stacking (spec §3.1 cap-counting Decision 1): removes a stacked item
 * and frees a slot against the 10-item free-tier cap. Atomic with the count
 * decrement via the unstack_opportunity() RPC (migration 0020) for the same
 * reason stacking is — a concurrent stack+unstack for the same user must
 * never leave profiles.stack_count out of sync with the real row count.
 */
export async function unstackOpportunity(userId: string, stackItemId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('unstack_opportunity', {
    p_user_id: userId,
    p_stack_item_id: stackItemId,
  });
  if (error) return { error: error.message };
  if (data === false) return { error: 'Item was already removed.' };
  return { error: null };
}

export async function toggleChecklistItem(
  item: ChecklistItem,
  stackItemId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('checklist_items')
    .update({ is_complete: !item.is_complete })
    .eq('id', item.id);
  if (error) return { error: error.message };

  await recalculateStatus(stackItemId);
  return { error: null };
}

export async function recalculateStatus(stackItemId: string): Promise<number> {
  const [{ data: items }, { data: current }] = await Promise.all([
    supabase.from('checklist_items').select('is_complete').eq('stack_item_id', stackItemId),
    supabase.from('stack_items').select('status').eq('id', stackItemId).single(),
  ]);

  const percent = checklistPercent(items);

  // Don't downgrade a completed "Stackd" item just because a checklist item
  // was later unchecked — that transition is manual, via re-stacking.
  if (current?.status !== 'Stackd') {
    await supabase.from('stack_items').update({ status: statusForProgress(percent) }).eq('id', stackItemId);
  }

  return percent;
}

export async function markStackd(stackItemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('stack_items').update({ status: 'Stackd' }).eq('id', stackItemId);
  return { error: error?.message ?? null };
}
