// Shared helpers for stackd. Edge Functions. `_shared` is excluded from
// per-function bundling by Supabase CLI convention, so this is safe to
// import from any function without being deployed as its own function.

import { createClient } from 'jsr:@supabase/supabase-js@2';

export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Constant-time string comparison for secret checks (service-role key here,
 * the RevenueCat webhook secret in revenuecat-webhook/index.ts). A plain
 * `===` short-circuits on the first differing byte, which is a real (if
 * impractical-to-exploit-over-a-network) timing side-channel for a secret
 * comparison. Compares full length regardless of an early mismatch, and
 * still does constant-effort work when lengths differ instead of returning
 * immediately.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Platform-level `verify_jwt` only checks that SOME valid JWT was sent — the
 * app's own bundled anon key satisfies it. These functions are meant to run
 * only via the daily cron job (0009_cron_jobs.sql), which authenticates with
 * the service_role key. Without this check, anyone holding the anon key
 * (trivially extractable from the app bundle) could invoke these functions
 * directly over HTTP at any time, out of schedule — most concerning for
 * notify-upcoming-deadlines, which would let an attacker trigger unscheduled
 * push notifications to real students' devices.
 */
export function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!timingSafeEqual(token, serviceRoleKey)) {
    return jsonError(401, 'This endpoint is cron-only and requires the service role key.');
  }
  return null;
}

/**
 * Section 4 (parse-document, score-match): these functions are invoked
 * directly by the signed-in student's own client, not by cron, so they
 * need the opposite check from requireServiceRole — confirm the bearer
 * token is a real user session and return that user's id. Edge Functions
 * run with `verify_jwt` on by default (a malformed/expired token never
 * reaches here), but a valid-but-different-user's token must still be
 * rejected from touching another user's rows. Using the service role
 * client to call auth.getUser(token) resolves the id without needing the
 * anon key inside the function.
 */
export async function getRequestUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// stackd. Section 7 (Polish) fix: every user-invoked Edge Function is called
// via `supabase.functions.invoke()` from the Expo client, which on web is a
// real browser `fetch()` subject to CORS. Without an `Access-Control-Allow-*`
// response (including on the OPTIONS preflight the browser sends first),
// Chrome/Safari/etc. block the request entirely -- the client never even
// sees the intended 501/429 body, just a generic "Failed to fetch" network
// error. That silently broke every "graceful AI-failure degraded state"
// this app has, specifically on web -- caught live during this section's
// full-core-loop QA pass (vault upload -> parse-document, via the gstack
// browse binary, which is a real Chromium instance and does enforce CORS,
// unlike a plain curl/node fetch). Native iOS/Android builds never hit this
// (CORS is a browser-only mechanism), but this project's only available
// visual QA surface in this sandboxed environment IS Expo web, so it's a
// real gap, not just a theoretical one.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Call first in every user-invoked function's Deno.serve handler; returns a
 * response to send back immediately for the browser's CORS preflight, or
 * null for any other method (continue with normal handling). */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
