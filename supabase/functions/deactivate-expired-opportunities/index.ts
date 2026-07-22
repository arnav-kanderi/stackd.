// stackd. Section 2 — daily cron Edge Function (spec §4, build-plan item 5a)
//
// Flips opportunities.is_active to false where deadline < today. Rows are
// never deleted (spec §2.2: "flips a database flag daily rather than
// deleting rows outright, so historical data isn't lost").
//
// Deploy: supabase functions deploy deactivate-expired-opportunities
// Schedule: see supabase/migrations/0009_cron_jobs.sql (pg_cron + pg_net,
// invoked daily via net.http_post using the service role key stored in
// Supabase Vault).

import { createServiceClient, jsonError, jsonOk, requireServiceRole } from '../_shared/service-client.ts';

Deno.serve(async (req) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('opportunities')
      .update({ is_active: false })
      .lt('deadline', today)
      .eq('is_active', true)
      .select('id, name, deadline');

    if (error) return jsonError(500, error.message);

    return jsonOk({ deactivated_count: data?.length ?? 0, deactivated: data ?? [] });
  } catch (err) {
    return jsonError(500, String(err));
  }
});
