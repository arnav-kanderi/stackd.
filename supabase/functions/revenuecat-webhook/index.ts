// stackd. Section 6 — RevenueCat webhook receiver (spec §3.1/§3.2 payment
// integration, Decision 2: RevenueCat over Stripe — see
// src/lib/subscription.ts and supabase/migrations/0021_subscription_events.sql
// for the full rationale).
//
// This is the server-side half of "purchase completes -> profiles.
// subscription_tier flips to premium." RevenueCat calls this endpoint
// whenever a subscriber's status changes (purchase, renewal, cancellation,
// expiration, billing issue, etc.) — see
// https://www.revenuecat.com/docs/integrations/webhooks for the payload
// shape this assumes.
//
// BLOCKED ON: a real RevenueCat project (see src/lib/subscription.ts's
// header comment). Until then this function is unreachable in practice
// (no webhooks are actually being sent), but it is fully wired and was
// verified against a hand-built payload matching RevenueCat's documented
// shape (see this section's report for the exact request/response).
//
// Auth: RevenueCat lets you configure a custom "Authorization" header value
// it sends on every webhook call — checked here against the
// REVENUECAT_WEBHOOK_SECRET project secret. Without this, anyone who finds
// this URL could grant themselves premium for free by POSTing a fake
// "purchase" event, the exact same class of hole the 0012 trigger closes
// for direct client writes.
//
// Tier-flip path: apply_subscription_event() (0021) — a security-definer
// RPC called via the service_role client, with per-event-id idempotency
// (RevenueCat's webhook delivery is at-least-once, so duplicate deliveries
// are expected, not an edge case). This is intentionally NOT a plain
// `.update({ subscription_tier: 'premium' })` even though service_role
// would pass the 0012 trigger either way — the idempotency guarantee is the
// actual reason for the RPC, same reasoning as reserve_chat_message (0019)
// and stack_opportunity (0020): don't hand-roll a race-prone check when an
// atomic single-statement primitive already exists for it.
//
// Deploy: supabase functions deploy revenuecat-webhook

import { createServiceClient, jsonError, jsonOk, timingSafeEqual } from '../_shared/service-client.ts';

// RevenueCat event types that grant/renew premium access. TRANSFER is
// handled separately below (post-review fix) -- it moves an entitlement
// BETWEEN two users, so it can't be reduced to "flip app_user_id to
// premium" the way every other type here can.
const PREMIUM_EVENT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
// Events that end premium access. NOTE (documented simplification): real
// RevenueCat billing has a grace period after BILLING_ISSUE before access
// is actually lost — treating BILLING_ISSUE as an immediate downgrade here
// is a deliberate simplification for this section's scope, flagged for
// follow-up once real subscribers exist. CANCELLATION is NOT in this set on
// purpose: a cancel just turns off auto-renew, access continues until the
// current period's EXPIRATION event actually arrives.
const DOWNGRADE_EVENT_TYPES = new Set(['EXPIRATION']);

interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string; // expected to be the Supabase auth.users.id (set via Purchases.logIn(userId) client-side once the SDK is installed)
  // TRANSFER only: the ids losing/gaining the entitlement. Per RevenueCat's
  // webhook docs, a single TRANSFER event can move an entitlement between
  // multiple ids on each side.
  transferred_from?: string[];
  transferred_to?: string[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonError(405, 'POST only');

  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return jsonError(501, 'RevenueCat webhook is not configured on this project (REVENUECAT_WEBHOOK_SECRET secret is missing).');
  }

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!timingSafeEqual(token, expectedSecret)) {
    return jsonError(401, 'Invalid webhook credentials.');
  }

  let body: { event?: RevenueCatEvent };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const event = body.event;
  if (!event?.id || !event.type) {
    return jsonError(400, 'Malformed RevenueCat event payload.');
  }

  const supabase = createServiceClient();

  // TRANSFER moves an entitlement between users -- found during Section 6
  // review: the previous version trusted a single app_user_id and only
  // granted premium to it, never revoking it from the losing side. Apply
  // 'free' to everyone in transferred_from and 'premium' to everyone in
  // transferred_to instead. Each affected user needs a DISTINCT dedup key
  // -- apply_subscription_event's idempotency ledger keys on event_id
  // alone, so reusing the bare event.id across multiple users here would
  // mean only the first applied and every subsequent one silently no-ops as
  // a "duplicate." Suffixing per user keeps a genuine duplicate webhook
  // delivery idempotent while still letting all affected users get applied
  // once each.
  if (event.type === 'TRANSFER') {
    const from = event.transferred_from ?? [];
    const to = event.transferred_to ?? [];
    if (from.length === 0 && to.length === 0) {
      return jsonError(400, 'TRANSFER event missing transferred_from/transferred_to.');
    }

    const results: { user_id: string; applied: boolean; tier: 'free' | 'premium' }[] = [];
    for (const userId of from) {
      const { data: applied, error } = await supabase.rpc('apply_subscription_event', {
        p_event_id: `${event.id}:from:${userId}`,
        p_user_id: userId,
        p_event_type: event.type,
        p_new_tier: 'free',
        p_source: 'individual',
        p_raw: event,
      });
      if (error) return jsonError(500, error.message);
      results.push({ user_id: userId, applied: !!applied, tier: 'free' });
    }
    for (const userId of to) {
      const { data: applied, error } = await supabase.rpc('apply_subscription_event', {
        p_event_id: `${event.id}:to:${userId}`,
        p_user_id: userId,
        p_event_type: event.type,
        p_new_tier: 'premium',
        p_source: 'individual',
        p_raw: event,
      });
      if (error) return jsonError(500, error.message);
      results.push({ user_id: userId, applied: !!applied, tier: 'premium' });
    }

    return jsonOk({ handled: true, transfer: results });
  }

  if (!event.app_user_id) {
    return jsonError(400, 'Malformed RevenueCat event payload.');
  }

  let newTier: 'free' | 'premium' | null = null;
  if (PREMIUM_EVENT_TYPES.has(event.type)) newTier = 'premium';
  else if (DOWNGRADE_EVENT_TYPES.has(event.type)) newTier = 'free';

  if (!newTier) {
    // Event type we don't map to a tier change (e.g. BILLING_ISSUE grace
    // period, TEST) -- acknowledge without touching subscription_tier so
    // RevenueCat doesn't retry it as a failure.
    return jsonOk({ handled: false, reason: `Event type ${event.type} does not change subscription_tier.` });
  }

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', event.app_user_id).maybeSingle();
  if (!profile) {
    return jsonError(404, `No profile found for app_user_id ${event.app_user_id}.`);
  }

  const { data: applied, error } = await supabase.rpc('apply_subscription_event', {
    p_event_id: event.id,
    p_user_id: event.app_user_id,
    p_event_type: event.type,
    p_new_tier: newTier,
    p_source: 'individual',
    p_raw: event,
  });

  if (error) return jsonError(500, error.message);

  return jsonOk({ handled: true, applied, tier: newTier });
});
