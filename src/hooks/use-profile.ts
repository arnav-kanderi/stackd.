import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

/**
 * Loads the signed-in user's profile row. No onboarding exists yet
 * (Section 3) — if a signed-in user has no profile row, `profile` stays
 * null and callers should prompt for the temporary test-profile flow
 * (see /supabase-test) rather than crash.
 */
export function useProfile() {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    if (!error) {
      setProfile(data as Profile | null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, refresh, userId: session?.user.id ?? null };
}
