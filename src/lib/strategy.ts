import { invokeEdgeFunction } from '@/lib/functions';

/**
 * Application strategy suggestions (spec §3.1 premium feature, build-plan
 * item 3). Client wrapper around the strategy-suggestions Edge Function —
 * mirrors match-score-stage2.ts's shape (all the real work — the premium
 * gate, the Claude call, the cache check — lives server-side).
 */
export interface StrategySuggestions {
  strengths: string[];
  gaps: string[];
  suggestions: string[];
}

export interface StrategyResult {
  cached: boolean;
  suggestions: StrategySuggestions;
}

export async function requestStrategySuggestions(
  stackItemId: string
): Promise<{ result: StrategyResult | null; error: string | null; status: number | null }> {
  const { data, error, status } = await invokeEdgeFunction<StrategyResult>('strategy-suggestions', { stackItemId });
  return { result: data, error, status };
}
