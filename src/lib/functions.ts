import { supabase } from '@/lib/supabase';

/**
 * Shared `supabase.functions.invoke()` unwrap. Previously duplicated three
 * times (vault.ts, match-score-stage2.ts, chat.ts) — chat.ts's copy was the
 * most capable (it also recovers the HTTP status to distinguish 429/501
 * from other failures), so this is that version, generalized. Every Edge
 * Function this app calls follows the same jsonOk/jsonError response shape
 * (see supabase/functions/_shared/service-client.ts), so one unwrap covers
 * all of them.
 */
export interface InvokeResult<T> {
  data: T | null;
  error: string | null;
  /** HTTP status of a non-2xx response, when recoverable. Callers that care about a specific status (e.g. 429 rate-limited, 501 not configured) check this. */
  status: number | null;
}

export async function invokeEdgeFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<InvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  // supabase-js turns any non-2xx Edge Function response into a thrown
  // FunctionsHttpError, surfaced here as `error` with `data: null` -- the
  // raw Response lives on `error.context` and its body (our jsonError JSON)
  // hasn't been read yet, so we parse it ourselves to recover both the
  // status and the human-readable message the Edge Function set.
  if (error) {
    const response = (error as { context?: Response }).context;
    const status = response?.status ?? null;
    let bodyMessage: string | undefined;
    try {
      const json = await response?.clone().json();
      bodyMessage = json?.error;
    } catch {
      // non-JSON error body (e.g. network failure) -- fall back to error.message below
    }
    return { data: null, error: bodyMessage ?? error.message ?? 'Request failed', status };
  }

  if (data?.ok === false) {
    return { data: null, error: data.error ?? 'Request failed', status: null };
  }

  return { data: data as T, error: null, status: null };
}
