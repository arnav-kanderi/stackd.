// stackd. Section 6 — priority alerts for high-match opportunities (spec
// §3.1 premium feature, build-plan item 5). Daily cron Edge Function,
// following the exact pattern of notify-upcoming-deadlines (Section 2) and
// the cron-wiring convention in supabase/migrations/0009_cron_jobs.sql
// (this section's cron entry is 0023_priority_alerts.sql).
//
// Trigger logic (must stay cheap — no AI needed to DECIDE whether to
// notify, per build-plan item 5's explicit instruction):
//   1. Find opportunities created in the last NEW_OPPORTUNITY_WINDOW_DAYS
//      days that are still active.
//   2. For each premium user with a push token, compute the FREE Stage-1
//      tag/eligibility score (same formula as src/lib/match-score.ts,
//      duplicated here rather than imported — that module isn't reachable
//      from Deno without bundling the whole React Native-adjacent src/lib
//      tree, and the formula is small/stable enough that duplication is
//      cheaper than building a shared-module bridge for one function).
//   3. Only opportunities scoring >= HIGH_MATCH_THRESHOLD trigger a
//      notification -- this is the Stage-1 gate the build-plan calls for.
//   4. Stage-2 (AI) is OPTIONAL and only for notification copy quality
//      (an estimated-acceptance-flavored line) -- if ANTHROPIC_API_KEY is
//      missing, the notification still sends using the Stage-1 score, it
//      just skips the nicer copy. This mirrors score-match's own
//      missing-key handling (never block the core feature on the AI key).
//   5. Dedup via priority_alerts_sent (migration 0023) -- one alert per
//      (user, opportunity) ever, not per day.
//
// Deploy: supabase functions deploy notify-priority-matches
// Schedule: supabase/migrations/0023_priority_alerts.sql

import { callClaudeJson, hasAnthropicKey } from '../_shared/anthropic-client.ts';
import { createServiceClient, jsonError, jsonOk, requireServiceRole } from '../_shared/service-client.ts';
import { sendExpoPush } from '../_shared/expo-push.ts';

const NEW_OPPORTUNITY_WINDOW_DAYS = 2; // matches this cron's own daily cadence with a small overlap
const HIGH_MATCH_THRESHOLD = 85; // 0-100 Stage-1 score gate for "especially high match" (spec §3.1 wording) -- default, flagged for confirmation same as other product-judgment numbers in this build

type ProfileRow = {
  id: string;
  expo_push_token: string | null;
  grade: string | null;
  location: string | null;
  gender: string | null;
  citizenship_status: string | null;
  gpa: number | null;
  interest_tags: string[] | null;
};

type OpportunityRow = {
  id: string;
  name: string;
  interest_tags: string[] | null;
  eligibility_grade: string[] | null;
  eligibility_citizenship: string | null;
  eligibility_gpa_min: number | null;
  eligibility_location: string | null;
  description: string | null;
};

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

// Deliberately the same weighting as src/lib/match-score.ts's Stage-1
// formula (60% tag overlap / 40% eligibility) -- kept in sync manually;
// if that formula ever changes, mirror the change here too.
function stage1Score(profile: ProfileRow, opp: OpportunityRow): number {
  const profileTags = (profile.interest_tags ?? []).map(norm);
  const oppTags = opp.interest_tags ?? [];
  const tagMatchCount = oppTags.filter((t) => profileTags.includes(norm(t))).length;
  const tagRatio = oppTags.length > 0 ? tagMatchCount / oppTags.length : 0;

  const checks: boolean[] = [];
  if (opp.eligibility_grade && opp.eligibility_grade.length > 0) {
    checks.push(!!profile.grade && opp.eligibility_grade.some((g) => norm(g) === norm(profile.grade)));
  }
  if (opp.eligibility_citizenship) {
    checks.push(norm(profile.citizenship_status) === norm(opp.eligibility_citizenship));
  }
  if (opp.eligibility_gpa_min != null) {
    checks.push(profile.gpa != null && profile.gpa >= opp.eligibility_gpa_min);
  }
  if (opp.eligibility_location) {
    const oppLoc = norm(opp.eligibility_location);
    const profileLoc = norm(profile.location);
    checks.push(
      oppLoc.includes('nationwide') || oppLoc.includes('remote') || (!!profileLoc && (oppLoc.includes(profileLoc) || profileLoc.includes(oppLoc)))
    );
  }
  const eligibilityRatio = checks.length > 0 ? checks.filter(Boolean).length / checks.length : 1;

  return Math.round((tagRatio * 0.6 + eligibilityRatio * 0.4) * 100);
}

Deno.serve(async (req) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();

    const windowStart = new Date(Date.now() - NEW_OPPORTUNITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: profiles, error: profError }, { data: opportunities, error: oppError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, expo_push_token, grade, location, gender, citizenship_status, gpa, interest_tags')
        .eq('subscription_tier', 'premium')
        .not('expo_push_token', 'is', null),
      supabase
        .from('opportunities')
        .select('id, name, interest_tags, eligibility_grade, eligibility_citizenship, eligibility_gpa_min, eligibility_location, description')
        .eq('is_active', true)
        .gte('created_at', windowStart),
    ]);

    if (profError) return jsonError(500, profError.message);
    if (oppError) return jsonError(500, oppError.message);

    const premiumProfiles = (profiles ?? []) as ProfileRow[];
    const newOpportunities = (opportunities ?? []) as OpportunityRow[];

    if (premiumProfiles.length === 0 || newOpportunities.length === 0) {
      return jsonOk({ candidates: 0, notified: 0 });
    }

    // Already-sent pairs, fetched once for all candidate users -- avoids an
    // N+1 query per (user, opportunity) pair.
    const { data: alreadySent, error: sentError } = await supabase
      .from('priority_alerts_sent')
      .select('user_id, opportunity_id')
      .in(
        'user_id',
        premiumProfiles.map((p) => p.id)
      );
    if (sentError) return jsonError(500, sentError.message);
    const sentSet = new Set((alreadySent ?? []).map((r) => `${r.user_id}:${r.opportunity_id}`));

    const candidates: { profile: ProfileRow; opportunity: OpportunityRow; score: number }[] = [];
    for (const profile of premiumProfiles) {
      for (const opp of newOpportunities) {
        if (sentSet.has(`${profile.id}:${opp.id}`)) continue;
        const score = stage1Score(profile, opp);
        if (score >= HIGH_MATCH_THRESHOLD) {
          candidates.push({ profile, opportunity: opp, score });
        }
      }
    }

    if (candidates.length === 0) {
      return jsonOk({ candidates: 0, notified: 0 });
    }

    // Stage-2 copy is best-effort and per-candidate -- a failure for one
    // candidate must not block the others, so each is wrapped individually
    // rather than one try/catch around the whole loop.
    const messages: { to: string; sound: string; title: string; body: string; data: Record<string, unknown> }[] = [];
    for (const c of candidates) {
      let body = `${c.opportunity.name} is a ${c.score}% match for you — check it out before it fills up.`;
      if (hasAnthropicKey()) {
        try {
          const parsed = await callClaudeJson<{ blurb: string }>(
            {
              system:
                'Write ONE short, exciting push-notification body (max 120 characters) telling a student about a new opportunity that is an especially strong match for them. Return ONLY JSON: {"blurb": string}. No emoji.',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ opportunity: c.opportunity, matchScore: c.score }),
                },
              ],
              maxTokens: 200,
            },
            'priority alert copy'
          );
          if (parsed.blurb) body = parsed.blurb.slice(0, 180);
        } catch {
          // Fall back to the Stage-1 templated body above -- the alert
          // still sends, it just isn't AI-polished.
        }
      }
      messages.push({
        to: c.profile.expo_push_token!,
        sound: 'default',
        title: 'High-match opportunity for you',
        body,
        data: { opportunityId: c.opportunity.id, matchScore: c.score },
      });
    }

    let sent = 0;
    if (messages.length > 0) {
      const pushResult = await sendExpoPush(messages);
      if (pushResult.ok) {
        sent = messages.length;
        await supabase.from('priority_alerts_sent').insert(
          candidates.map((c) => ({ user_id: c.profile.id, opportunity_id: c.opportunity.id }))
        );
      } else {
        return jsonError(502, `Expo push API error: ${pushResult.errorText}`);
      }
    }

    return jsonOk({ candidates: candidates.length, notified: sent });
  } catch (err) {
    return jsonError(500, String(err));
  }
});
