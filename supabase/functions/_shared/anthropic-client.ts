// Shared Anthropic (Claude) client helper for stackd. Edge Functions
// (Section 4: document parsing + Stage-2 match scoring). Deliberately
// server-side only — the API key must never ship in the Expo client bundle,
// so both AI features are edge functions the app invokes via
// supabase.functions.invoke(), never a direct client -> Anthropic call.
//
// ANTHROPIC_API_KEY is not currently set as a secret on this project (see
// `supabase secrets list` — only the standard SUPABASE_* secrets exist).
// Callers must check `hasAnthropicKey()` first and return a clear 501
// rather than silently producing fake output.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-5-20250929';

export function hasAnthropicKey(): boolean {
  return !!Deno.env.get('ANTHROPIC_API_KEY');
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string | ClaudeContentBlock[] };

/**
 * Calls Claude and returns the raw text of the first text block. Throws on
 * any non-2xx response or missing key — callers are expected to catch and
 * turn this into a jsonError(501/502, ...), never fall back to fabricated
 * content.
 *
 * Accepts a real `messages` array (multi-turn — for Section 5's chatbot,
 * which needs conversation history) as well as a single-turn `content`
 * shorthand (what Section 4's document parsing / match scoring use — one
 * user turn, no history). Exactly one of `messages` or `content` must be
 * passed.
 */
export async function callClaude(
  params: { system: string; maxTokens?: number } & (
    | { messages: ClaudeMessage[]; content?: never }
    | { content: ClaudeContentBlock[]; messages?: never }
  )
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured on this project.');
  }

  const messages = params.messages ?? [{ role: 'user', content: params.content }];

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Anthropic response had no text content block.');
  }
  return textBlock.text as string;
}

/**
 * Shared "call Claude, expect JSON back" helper — parse-document and
 * score-match both did this identically (call, regex out the {...} block,
 * JSON.parse, catch-and-jsonError on failure) before this was factored out.
 * Throws on JSON-parse failure (with a caller-supplied context string in the
 * message) so callers can catch it the same way they catch callClaude's own
 * throws, rather than needing two separate error-handling shapes.
 */
export async function callClaudeJson<T>(
  params: { system: string; maxTokens?: number } & (
    | { messages: ClaudeMessage[]; content?: never }
    | { content: ClaudeContentBlock[]; messages?: never }
  ),
  context: string
): Promise<T> {
  const raw = await callClaude(params);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw) as T;
  } catch {
    throw new Error(`Claude returned non-JSON output for ${context}.`);
  }
}
