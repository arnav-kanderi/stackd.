// stackd. Section 4 — Stage-2 AI-reasoned match score (spec §2.3 Stage 2,
// build-plan item 3).
//
// Trigger logic (must match build-plan exactly):
//   - Called by the client when a student taps "Stack It" (src/lib/
//     stack-actions.ts, right after the Stage-1 insert), and optionally
//     when opening a premium user's Prep/match-detail view for a bounded
//     top-N set already stacked -- NEVER wired to feed-card render.
//   - Premium-only: free-tier callers get a 403 here (data-level gate; the
//     paywall UI itself is Section 6, out of scope).
//   - Cache: `match_inputs_hash` fingerprints the exact inputs that fed the
//     last Stage-2 call (profile core fields + this opportunity's
//     requirements/eligibility + each vault doc's updated_at). If the
//     fingerprint is unchanged and match_stage is already 'stage2', this
//     function returns the cached row WITHOUT calling Claude -- this is
//     the behavior the acceptance criteria's "re-opening a stacked item
//     does not re-trigger the call" check exercises.
//
// Deploy: supabase functions deploy score-match

import { callClaudeJson, hasAnthropicKey } from '../_shared/anthropic-client.ts';
import { createServiceClient, getRequestUserId, handleCorsPreflight, jsonError, jsonOk } from '../_shared/service-client.ts';

const SCORE_SYSTEM_PROMPT = `You are scoring how well a student matches an opportunity (internship, scholarship, competition, etc.) for a college/career-prep app. You will be given the student's profile, their parsed vault documents (resume/transcript/essays/activities), and the opportunity's stated requirements and eligibility criteria. Return ONLY valid JSON, no prose, matching this shape:
{
  "score": number,               // 0-100 overall match percentage
  "breakdown": {
    "tags": [{ "label": string, "met": boolean }],
    "eligibility": [{ "label": string, "met": boolean }]
  },
  "estimated_acceptance": "High" | "Medium" | "Low"
}
Base "met" strictly on the provided data -- do not assume facts not given. estimated_acceptance should weigh both the match score and how selective the opportunity appears (from its description) to be.`;

type ProfileCoreFields = {
  grade: string | null;
  location: string | null;
  gender: string | null;
  citizenship_status: string | null;
  gpa: number | null;
  interest_tags: string[] | null;
};
type DocRow = { doc_type: string; updated_at: string; parsed_content: unknown };

async function computeInputsHash(
  profile: ProfileCoreFields | null,
  docs: DocRow[],
  opportunity: { id: string; application_requirements: string[] | null; eligibility_other: string | null }
): Promise<string> {
  const fingerprint = JSON.stringify({
    profile,
    docs: docs.map((d) => `${d.doc_type}:${d.updated_at}`).sort(),
    opportunityId: opportunity.id,
    requirements: (opportunity.application_requirements ?? []).slice().sort(),
    eligibilityOther: opportunity.eligibility_other,
  });

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(405, 'POST only');

  const userId = await getRequestUserId(req);
  if (!userId) return jsonError(401, 'Missing or invalid session.');

  let body: { stackItemId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  if (!body.stackItemId) return jsonError(400, 'stackItemId is required.');

  const supabase = createServiceClient();

  const { data: stackItem, error: siError } = await supabase
    .from('stack_items')
    .select(
      'id, user_id, match_stage, match_inputs_hash, match_score, match_breakdown, estimated_acceptance, opportunity:opportunities(*)'
    )
    .eq('id', body.stackItemId)
    .single();

  if (siError || !stackItem) return jsonError(404, 'Stack item not found.');
  if (stackItem.user_id !== userId) return jsonError(403, 'You do not own this stack item.');

  const opportunity = stackItem.opportunity as unknown as {
    id: string;
    name: string;
    description: string | null;
    application_requirements: string[] | null;
    eligibility_grade: string[] | null;
    eligibility_citizenship: string | null;
    eligibility_gpa_min: number | null;
    eligibility_location: string | null;
    eligibility_other: string | null;
    interest_tags: string[] | null;
  };
  if (!opportunity) return jsonError(500, 'Stack item has no linked opportunity.');

  // Profile (subscription check + hash + Claude input) and docs (hash +
  // Claude input) are each fetched exactly once and reused for both the
  // cache-hash computation and the eventual Claude call -- previously these
  // were fetched twice each (found during Section 4 review).
  const [{ data: profile }, { data: docs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('subscription_tier, grade, location, gender, citizenship_status, gpa, interest_tags')
      .eq('id', userId)
      .single(),
    supabase.from('user_documents').select('doc_type, updated_at, parsed_content').eq('user_id', userId),
  ]);

  if (profile?.subscription_tier !== 'premium') {
    return jsonError(403, 'Stage-2 AI match scoring is a premium feature.');
  }

  // Hash only the fields that actually affect matching -- subscription_tier
  // is part of `profile` (fetched above for the gate check) but must NOT be
  // part of the fingerprint, or a tier change alone would invalidate an
  // otherwise-unchanged cached score.
  const profileCore: ProfileCoreFields = {
    grade: profile.grade,
    location: profile.location,
    gender: profile.gender,
    citizenship_status: profile.citizenship_status,
    gpa: profile.gpa,
    interest_tags: profile.interest_tags,
  };
  const newHash = await computeInputsHash(profileCore, docs ?? [], opportunity);

  // Cache hit: identical inputs, already Stage-2, and not a forced
  // recompute -- return the cached row without calling Claude.
  if (!body.force && stackItem.match_stage === 'stage2' && stackItem.match_inputs_hash === newHash) {
    return jsonOk({
      cached: true,
      match_score: stackItem.match_score,
      match_breakdown: stackItem.match_breakdown,
      estimated_acceptance: stackItem.estimated_acceptance,
    });
  }

  if (!hasAnthropicKey()) {
    return jsonError(
      501,
      'Stage-2 AI scoring is not configured on this project (ANTHROPIC_API_KEY secret is missing). Stage-1 score remains in effect.'
    );
  }

  const { data: contacts } = await supabase
    .from('recommendation_contacts')
    .select('name, relationship, status')
    .eq('user_id', userId);

  try {
    const parsed = await callClaudeJson<{ score: number; breakdown: unknown; estimated_acceptance: 'High' | 'Medium' | 'Low' }>(
      {
        system: SCORE_SYSTEM_PROMPT,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ profile, documents: docs, recommendationContacts: contacts, opportunity }),
          },
        ],
        maxTokens: 1024,
      },
      'match scoring'
    );

    const { error: updateError } = await supabase
      .from('stack_items')
      .update({
        match_score: parsed.score,
        match_breakdown: parsed.breakdown,
        estimated_acceptance: parsed.estimated_acceptance,
        match_stage: 'stage2',
        match_inputs_hash: newHash,
        match_computed_at: new Date().toISOString(),
      })
      .eq('id', stackItem.id);
    if (updateError) return jsonError(500, updateError.message);

    return jsonOk({
      cached: false,
      match_score: parsed.score,
      match_breakdown: parsed.breakdown,
      estimated_acceptance: parsed.estimated_acceptance,
    });
  } catch (err) {
    return jsonError(502, String(err));
  }
});
