import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { fetchRecommendationContacts, fetchVaultDocuments, type RecommendationContact, type VaultDocument } from '@/lib/vault';

// 10 min, not 1hr: these documents are minors' resumes/transcripts.
// Regenerated fresh on every useVault mount/refresh (Prep popup open), so
// this only shortens the exposure window if a URL leaks (device compromise,
// clipboard sync, etc.) -- it doesn't affect the popup's own usability
// (post-review security fix, Section 4).
const SIGNED_URL_TTL_SECONDS = 10 * 60;

/**
 * Loads a user's vault documents + recommendation contacts, plus signed
 * URLs for each document (the bucket is private, spec §2.4/§4 -- files
 * aren't publicly readable, so the Prep popup needs a short-lived signed
 * URL per storage_path rather than a public one).
 */
export function useVault(userId: string | null) {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [contacts, setContacts] = useState<RecommendationContact[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDocuments([]);
      setContacts([]);
      setSignedUrls({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const [docs, contactRows] = await Promise.all([fetchVaultDocuments(userId), fetchRecommendationContacts(userId)]);
    setDocuments(docs);
    setContacts(contactRows);

    if (docs.length > 0) {
      const { data, error } = await supabase.storage
        .from('vault-documents')
        .createSignedUrls(
          docs.map((d) => d.storage_path),
          SIGNED_URL_TTL_SECONDS
        );
      if (!error && data) {
        const map: Record<string, string> = {};
        data.forEach((entry) => {
          if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
        });
        setSignedUrls(map);
      }
    } else {
      setSignedUrls({});
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { documents, contacts, signedUrls, loading, refresh };
}
