// stackd. Section 5 — Chatbot (spec §2.6, build-plan 05-chatbot.md).
//
// The one and only place a chat turn happens. The client (src/lib/chat.ts)
// never calls Claude directly and never sees ANTHROPIC_API_KEY -- it invokes
// this function per turn. This function:
//   1. Resolves the caller via getRequestUserId (same pattern as
//      parse-document/score-match -- a bearer token that isn't a valid
//      session is rejected before touching anything).
//   2. Atomically reserves a slot against a tier-appropriate daily cap
//      BEFORE calling Claude, via reserve_chat_message() -- a dedicated
//      counter table (chat_rate_limit), not a COUNT off chat_messages. An
//      earlier version counted chat_messages directly, which had a TOCTOU
//      race: concurrent requests could all read the same pre-insert count
//      and all pass the cap check. The atomic reserve closes that (found
//      during Section 5 review). A reservation that turns out unused
//      (missing key, failed Claude call) is refunded via
//      release_chat_message() so outages don't burn the user's quota.
//   3. Assembles a SUMMARIZED context (stack counts by status + upcoming
//      deadlines, not full row dumps; profile grade + interest_tags) --
//      token cost discipline per spec's cost-control framing. Lighter than
//      score-match's context on purpose: this is a high-volume/
//      lower-value-per-call feature, unlike a one-time match score.
//   4. Calls Claude via the shared callClaude() with a real multi-turn
//      `messages` array built from this user's actual recent chat_messages
//      history, not just the current turn.
//   5. Persists BOTH the user's message and Claude's reply to chat_messages
//      only after a successful Claude response -- chat_messages is now the
//      conversation record, not the rate-limit ledger (that's
//      chat_rate_limit, reserved earlier in the request).
//
// Rate limit numbers (product decision, NOT specified in the spec -- see
// build-plan 05-chatbot.md and DEFERRED-EXTERNAL-ACTIONS.md; flagged in the
// Section 5 report as needing user confirmation):
//   free:    20 messages/day
//   premium: 200 messages/day (materially higher, not unlimited, so a
//            single premium account can't be used to hammer the Claude API
//            without any ceiling)
//
// The chatbot answers questions only -- per spec §7's no-autofill
// constraint, it never stacks items or fills forms, and the system prompt
// says so explicitly so Claude doesn't imply it can.
//
// Deploy: supabase functions deploy chat

import { callClaude, hasAnthropicKey, type ClaudeMessage } from '../_shared/anthropic-client.ts';
import { createServiceClient, getRequestUserId, handleCorsPreflight, jsonError, jsonOk } from '../_shared/service-client.ts';

// TODO(user): confirm these before real usage -- not specified in the spec,
// invented as reasonable defaults, flagged in the Section 5 report. Change
// here; RATE_LIMITS below is the only place tier -> cap is decided.
const RATE_LIMITS: Record<'free' | 'premium', number> = {
  free: 20,
  premium: 200,
};
const HISTORY_TURNS = 20; // most recent chat_messages rows (user+assistant) pulled in as conversation history
const MAX_MESSAGE_LENGTH = 4000;
const UPCOMING_DEADLINE_WINDOW_DAYS = 30;
const MAX_UPCOMING_DEADLINES = 8;

const CHAT_SYSTEM_PROMPT_PREFIX = `You are the in-app assistant for stackd., an app that helps students (roughly ages 14-22) find and apply to internships, scholarships, competitions, and other extracurricular opportunities. You can answer questions about the student's own stacked opportunities, give general application advice (resumes, essays, interviews, timelines), and help them think through decisions.

Hard constraints:
- You cannot take any action in the app. You cannot stack an opportunity, fill out a checklist item, submit an application, or edit the student's profile/documents -- you can only talk. If asked to "do" something in-app, explain that you can only answer questions and the student needs to do it themselves in the app.
- Do not fabricate specific opportunities, deadlines, or eligibility rules that aren't in the context provided below. If you don't have the information, say so.
- Keep answers concise and actionable -- this is a chat interface on a mobile app, not an essay.

Student context (summarized for cost efficiency -- ask the student directly if you need more detail than this):
`;

type ProfileRow = { subscription_tier: string; grade: string | null; interest_tags: string[] | null };
type StackRow = { status: string; opportunity: { name: string; deadline: string | null } | null };
type ChatRow = { role: 'user' | 'assistant'; content: string; created_at: string };

function buildContextSummary(profile: ProfileRow, stackRows: StackRow[]): string {
  const counts: Record<string, number> = {};
  for (const row of stackRows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  const countsLine =
    Object.keys(counts).length > 0
      ? Object.entries(counts)
          .map(([status, n]) => `${status}: ${n}`)
          .join(', ')
      : 'no stacked opportunities yet';

  const now = Date.now();
  const windowMs = UPCOMING_DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const upcoming = stackRows
    .filter((r) => r.status !== 'Stackd' && r.opportunity?.deadline)
    .map((r) => ({ name: r.opportunity!.name, deadline: r.opportunity!.deadline as string }))
    .filter((r) => {
      const t = new Date(r.deadline).getTime();
      return !Number.isNaN(t) && t - now <= windowMs;
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, MAX_UPCOMING_DEADLINES);

  const deadlinesLine =
    upcoming.length > 0
      ? upcoming.map((u) => `${u.name} (due ${u.deadline})`).join('; ')
      : `none in the next ${UPCOMING_DEADLINE_WINDOW_DAYS} days`;

  return [
    `Grade: ${profile.grade ?? 'not set'}`,
    `Interests: ${profile.interest_tags && profile.interest_tags.length > 0 ? profile.interest_tags.join(', ') : 'not set'}`,
    `Stack status counts -- ${countsLine}`,
    `Upcoming deadlines (next ${UPCOMING_DEADLINE_WINDOW_DAYS} days) -- ${deadlinesLine}`,
  ].join('\n');
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(405, 'POST only');

  const userId = await getRequestUserId(req);
  if (!userId) return jsonError(401, 'Missing or invalid session.');

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const message = (body.message ?? '').trim();
  if (!message) return jsonError(400, 'message is required.');
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonError(400, `message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const supabase = createServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_tier, grade, interest_tags')
    .eq('id', userId)
    .single();
  if (profileError || !profile) return jsonError(404, 'Profile not found.');

  const tier = profile.subscription_tier === 'premium' ? 'premium' : 'free';
  const cap = RATE_LIMITS[tier];

  // Server-enforced rate limit: an ATOMIC reserve-then-check against a
  // dedicated counter (chat_rate_limit), not a plain COUNT-then-later-INSERT
  // -- the previous version had a TOCTOU race where concurrent requests
  // could all read the same pre-insert count and all pass the cap check
  // before any of them persisted a row (found during Section 5 review).
  // reserve_chat_message's ON CONFLICT ... WHERE ... RETURNING is a single
  // atomic statement Postgres serializes per (user_id, day), so concurrent
  // callers for the same user genuinely queue rather than racing.
  const { data: reservedCount, error: reserveError } = await supabase.rpc('reserve_chat_message', {
    p_user_id: userId,
    p_cap: cap,
  });
  if (reserveError) {
    console.error('reserve_chat_message failed:', reserveError.message);
    return jsonError(500, 'Something went wrong, try again.');
  }

  if (reservedCount === null) {
    return jsonError(
      429,
      `Daily chat limit reached (${cap} messages/day on the ${tier} plan). ${
        tier === 'free' ? 'Upgrade to premium for a higher daily limit, or try again tomorrow.' : 'Try again tomorrow.'
      }`
    );
  }

  if (!hasAnthropicKey()) {
    // The reservation already consumed a slot even though no Claude call
    // will happen -- refund it so a missing key doesn't burn the user's
    // daily quota.
    await supabase.rpc('release_chat_message', { p_user_id: userId });
    return jsonError(501, 'The chatbot is not configured on this project (ANTHROPIC_API_KEY secret is missing).');
  }

  // Context assembly (stack state) and conversation history are independent
  // of each other -- both only depend on userId -- so fetch in parallel
  // instead of two sequential round trips.
  const [{ data: stackRows }, { data: historyRows, error: historyError }] = await Promise.all([
    // Summarized stack state only -- deliberately NOT the full
    // vault/opportunity row dumps score-match uses, since this is a much
    // higher-volume, lower-value-per-call feature.
    supabase.from('stack_items').select('status, opportunity:opportunities(name, deadline)').eq('user_id', userId),
    // Most recent HISTORY_TURNS rows, re-ordered ascending below for
    // Claude's messages array (Anthropic expects chronological, alternating
    // turns).
    supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS),
  ]);
  if (historyError) {
    console.error('chat history fetch failed:', historyError.message);
    return jsonError(500, 'Something went wrong, try again.');
  }

  const contextSummary = buildContextSummary(profile as ProfileRow, (stackRows as unknown as StackRow[]) ?? []);
  const system = CHAT_SYSTEM_PROMPT_PREFIX + contextSummary;

  const history = ((historyRows as ChatRow[]) ?? []).reverse();
  const claudeMessages: ClaudeMessage[] = [
    ...history.map((h) => ({ role: h.role, content: h.content }) as ClaudeMessage),
    { role: 'user' as const, content: message },
  ];

  let reply: string;
  try {
    reply = await callClaude({ system, messages: claudeMessages, maxTokens: 1024 });
  } catch (err) {
    // Same refund logic as the missing-key case above -- a failed Claude
    // call (network, Anthropic-side error) didn't actually cost anything,
    // so it shouldn't count against the user's daily quota either.
    await supabase.rpc('release_chat_message', { p_user_id: userId });
    console.error('callClaude failed:', String(err));
    return jsonError(502, 'The chatbot is temporarily unavailable, try again.');
  }

  // Persist both turns together, only on success -- a failed Claude call
  // above leaves no row, so it never counts against the rate limit and
  // there's nothing to roll back.
  const { error: insertError } = await supabase.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: message },
    { user_id: userId, role: 'assistant', content: reply },
  ]);
  if (insertError) {
    console.error('chat_messages insert failed:', insertError.message);
    return jsonError(500, 'Something went wrong, try again.');
  }

  return jsonOk({ reply, tier, dailyCap: cap, messagesUsedToday: reservedCount });
});
