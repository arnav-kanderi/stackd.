// stackd. Section 6 — Application strategy suggestions (spec §3.1, build-plan
// item 3): premium-only per-opportunity resume/application feedback, built
// on Section 4's already-parsed vault content (user_documents.parsed_content).
//
// Mirrors score-match/index.ts's structure closely on purpose (same
// premium gate, same cache-by-inputs-hash pattern, same 501-on-missing-key
// handling) — this is deliberately not a new pattern, just a new prompt
// over data that's already fetched the same way.
//
// Deploy: supabase functions deploy strategy-suggestions

import { callClaudeJson, hasAnthropicKey } from '../_shared/anthropic-client.ts';
import { createServiceClient, getRequestUserId, handleCorsPreflight, jsonError, jsonOk } from '../_shared/service-client.ts';

const STRATEGY_SYSTEM_PROMPT = `You are a college/career-prep application strategist for a student using an app called stackd. You will be given the student's profile, their parsed vault documents (resume/transcript/essays/activities), and one specific opportunity's requirements and eligibility criteria. Return ONLY valid JSON, no prose, matching this shape:
{
  "strengths": string[],     // 2-4 concrete things already in the student's materials that fit this opportunity well
  "gaps": string[],          // 2-4 concrete things missing or weak relative to this opportunity's stated requirements
  "suggestions": string[]    // 3-5 specific, actionable things to fix or add before applying (e.g. "Add a quantified outcome to the robotics club bullet on your resume")
}
Be concrete and specific to THIS opportunity and THIS student's actual materials — never generic advice. Base everything strictly on the provided data; do not assume facts not given.`;

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
    .select('id, user_id, strategy_suggestions, strategy_inputs_hash, opportunity:opportunities(*)')
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

  const [{ data: profile }, { data: docs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('subscription_tier, grade, location, gender, citizenship_status, gpa, interest_tags')
      .eq('id', userId)
      .single(),
    supabase.from('user_documents').select('doc_type, updated_at, parsed_content').eq('user_id', userId),
  ]);

  if (profile?.subscription_tier !== 'premium') {
    return jsonError(403, 'Application strategy suggestions are a premium feature.');
  }

  const profileCore: ProfileCoreFields = {
    grade: profile.grade,
    location: profile.location,
    gender: profile.gender,
    citizenship_status: profile.citizenship_status,
    gpa: profile.gpa,
    interest_tags: profile.interest_tags,
  };
  const newHash = await computeInputsHash(profileCore, docs ?? [], opportunity);

  if (!body.force && stackItem.strategy_suggestions && stackItem.strategy_inputs_hash === newHash) {
    return jsonOk({ cached: true, suggestions: stackItem.strategy_suggestions });
  }

  if (!hasAnthropicKey()) {
    return jsonError(
      501,
      'Strategy suggestions are not configured on this project (ANTHROPIC_API_KEY secret is missing).'
    );
  }

  try {
    const parsed = await callClaudeJson<{ strengths: string[]; gaps: string[]; suggestions: string[] }>(
      {
        system: STRATEGY_SYSTEM_PROMPT,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ profile: profileCore, documents: docs, opportunity }),
          },
        ],
        maxTokens: 1024,
      },
      'strategy suggestions'
    );

    const { error: updateError } = await supabase
      .from('stack_items')
      .update({
        strategy_suggestions: parsed,
        strategy_inputs_hash: newHash,
        strategy_computed_at: new Date().toISOString(),
      })
      .eq('id', stackItem.id);
    if (updateError) return jsonError(500, updateError.message);

    return jsonOk({ cached: false, suggestions: parsed });
  } catch (err) {
    return jsonError(502, String(err));
  }
});
