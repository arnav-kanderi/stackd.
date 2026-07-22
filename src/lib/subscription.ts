/**
 * stackd. Section 6 — client-side subscription plumbing (spec §3.1/§3.2,
 * build-plan 06-monetization-gating.md Decision 2: RevenueCat vs Stripe).
 *
 * DEFAULTED TO REVENUECAT (no user available to confirm mid-build — FLAG
 * FOR CONFIRMATION, same pattern as Section 5's chatbot rate-limit
 * numbers). Rationale: this is a React Native/Expo app; native
 * subscription IAP is the standard mobile path (and effectively required
 * by App Store review for a pure digital-service subscription), and
 * RevenueCat is purpose-built to sit in front of StoreKit/Play Billing.
 * See supabase/migrations/0021_subscription_events.sql for the matching
 * server-side rationale and the webhook receiving end.
 *
 * BLOCKED ON (same pattern as LinkedIn OAuth in Section 3 and
 * ANTHROPIC_API_KEY in Sections 4-5 — build the full plumbing, prove it's
 * structurally correct, report exactly what's missing rather than faking
 * a purchase):
 *   1. A RevenueCat account + project, with iOS/Android API keys.
 *   2. App Store Connect / Google Play Console in-app-purchase products
 *      configured (e.g. "stackd_premium_monthly", $5.99/mo) and attached
 *      to a RevenueCat "premium" entitlement.
 *   3. The `react-native-purchases` native SDK added to the Expo project
 *      and a development build (not Expo Go) to actually test a purchase.
 *      Deliberately NOT added as a dependency in this environment: there is
 *      no iOS/Android simulator or RevenueCat project to build/test
 *      against here (see WORKFLOW-AND-STATE.md's "no simulator" gotcha),
 *      and adding an untestable native module is worse than clearly
 *      stubbing the call site — a broken native dependency could also
 *      break the Expo web build this project's QA relies on.
 *
 * What IS real and testable without the above: the paywall UI
 * (paywall-modal.tsx) triggers on the actual atomic cap-enforcement RPC
 * result (stack-actions.ts), and the server-side webhook + tier-flip RPC
 * (revenuecat-webhook Edge Function + apply_subscription_event RPC) are
 * fully built and would work correctly the moment RevenueCat starts
 * sending real webhook events — see this section's report for how that was
 * verified (a simulated webhook payload against the live Edge Function).
 */

export interface PaywallResult {
  completed: boolean;
  reason?: string;
}

/** True once real RevenueCat keys exist — checked via the same env-var
 * convention as other client-side "is this configured" checks in this app
 * (nothing here is ever a secret; RevenueCat's public SDK keys are
 * client-safe by design, same as the Supabase anon key). */
export function isRevenueCatConfigured(): boolean {
  return !!(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);
}

/**
 * Would present RevenueCat's native paywall / purchase sheet
 * (`Purchases.getOfferings()` + `Purchases.purchasePackage()`) and, on a
 * successful purchase, RevenueCat's SDK fires a webhook to
 * `revenuecat-webhook` (see supabase/functions/revenuecat-webhook) which
 * flips profiles.subscription_tier server-side — the client never writes
 * subscription_tier directly (structurally blocked by the 0012 trigger
 * even if it tried).
 *
 * Without the SDK/keys configured, this returns a clear "not configured"
 * result instead of crashing or pretending to succeed — never fabricate a
 * successful purchase.
 */
export async function presentPaywall(): Promise<PaywallResult> {
  if (!isRevenueCatConfigured()) {
    return {
      completed: false,
      reason:
        'Payments aren’t configured in this environment yet (RevenueCat SDK keys and App Store/Play Store product IDs are missing). See DEFERRED-EXTERNAL-ACTIONS.md.',
    };
  }

  // Real integration point once react-native-purchases is installed and
  // configured, e.g.:
  //   const offerings = await Purchases.getOfferings();
  //   const pkg = offerings.current?.monthly;
  //   if (!pkg) return { completed: false, reason: 'No premium offering configured.' };
  //   await Purchases.purchasePackage(pkg);
  //   return { completed: true };
  return { completed: false, reason: 'RevenueCat SDK is not installed in this build.' };
}
