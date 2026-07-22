// Shared Expo push send for stackd. Edge Functions. Previously duplicated
// near-verbatim in notify-upcoming-deadlines (Section 2) and
// notify-priority-matches (Section 6) -- same URL constant, same
// fetch-then-check-ok shape. Callers keep their own DB bookkeeping
// (dedup tables, timestamps) since that genuinely differs per caller.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushMessage = {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendExpoPush(
  messages: ExpoPushMessage[]
): Promise<{ ok: true } | { ok: false; errorText: string }> {
  const resp = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, errorText: await resp.text() };
}
