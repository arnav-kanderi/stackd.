// stackd. Section 2 — daily cron Edge Function (spec §4/§2.5, build-plan item 5b)
//
// Checks stack_items with an approaching deadline (not yet "Stackd") and
// sends an Expo push notification, once per item per day, to students who
// have registered a push token (profiles.expo_push_token, see
// src/lib/notifications.ts). Dedup guard: stack_items.last_notified_at
// (migration 0007) — skip items notified within the last 20 hours so a
// re-run of the same day's cron doesn't double-send.
//
// Deploy: supabase functions deploy notify-upcoming-deadlines
// Schedule: see supabase/migrations/0009_cron_jobs.sql

import { createServiceClient, jsonError, jsonOk, requireServiceRole } from '../_shared/service-client.ts';
import { sendExpoPush } from '../_shared/expo-push.ts';

const NOTIFY_WINDOW_DAYS = 3; // "priority" window — closer than My Stack's 7-day "Due Soon" banner
const RENOTIFY_COOLDOWN_HOURS = 20;

Deno.serve(async (req) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();

    const today = new Date();
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + NOTIFY_WINDOW_DAYS);
    const todayStr = today.toISOString().slice(0, 10);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);
    const cooldownCutoff = new Date(today.getTime() - RENOTIFY_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

    const { data: stackItems, error } = await supabase
      .from('stack_items')
      .select(
        'id, status, last_notified_at, opportunity:opportunities(name, deadline), profile:profiles(id, expo_push_token)'
      )
      .neq('status', 'Stackd')
      .or(`last_notified_at.is.null,last_notified_at.lt.${cooldownCutoff}`);

    if (error) return jsonError(500, error.message);

    type Row = {
      id: string;
      last_notified_at: string | null;
      opportunity: { name: string; deadline: string | null } | null;
      profile: { id: string; expo_push_token: string | null } | null;
    };

    const due = (stackItems ?? []).filter((row: Row) => {
      const deadline = row.opportunity?.deadline;
      if (!deadline) return false;
      return deadline >= todayStr && deadline <= windowEndStr && !!row.profile?.expo_push_token;
    }) as Row[];

    const messages = due.map((row) => ({
      to: row.profile!.expo_push_token,
      sound: 'default',
      title: 'Deadline approaching',
      body: `${row.opportunity?.name} is due ${row.opportunity?.deadline}. Don't miss it!`,
      data: { stackItemId: row.id },
    }));

    let sent = 0;
    if (messages.length > 0) {
      const pushResult = await sendExpoPush(messages);
      if (pushResult.ok) {
        sent = messages.length;
        const nowIso = new Date().toISOString();
        await supabase
          .from('stack_items')
          .update({ last_notified_at: nowIso })
          .in(
            'id',
            due.map((r) => r.id)
          );
      } else {
        return jsonError(502, `Expo push API error: ${pushResult.errorText}`);
      }
    }

    return jsonOk({ candidates: stackItems?.length ?? 0, notified: sent });
  } catch (err) {
    return jsonError(500, String(err));
  }
});
