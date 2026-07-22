import { isKnownRequirement, labelForRequirement } from '@/lib/checklist';
import type { RecommendationContact, VaultDocType, VaultDocument } from '@/lib/vault';

/**
 * Real Prep popup content (replaces src/lib/mock-vault.ts's stub, spec
 * §2.5 step 2). Locked requirement -> vault mapping (see lib/checklist.ts):
 * 'resume' | 'transcript' | 'essay' | 'activity_list' map 1:1 to
 * user_documents.doc_type; 'recommendation_letter' maps to
 * recommendation_contacts. Every ApplicationRequirement value has exactly
 * one mapping target -- there is no "unmapped requirement" case, so this
 * module never needs an unhandled-requirement fallback path.
 *
 * VaultContent stays the same union prep-modal.tsx already renders by
 * `.type` (text | file | contact) -- only the data source changes here.
 * Unlike the stub (one item per requirement), a requirement can now surface
 * zero, one, or many vault items (e.g. multiple essays, multiple
 * recommenders), so this returns an array per requirement and
 * prep-modal.tsx flatMaps instead of maps.
 */
export type VaultContent =
  | { type: 'text'; value: string }
  | { type: 'file'; filename: string; url: string }
  | { type: 'contact'; name: string; email: string; relationship: string; status: string };

function filenameFromPath(storagePath: string): string {
  return storagePath.split('/').pop() ?? storagePath;
}

export function vaultContentForRequirement(
  requirement: string,
  documents: VaultDocument[],
  contacts: RecommendationContact[],
  signedUrls: Record<string, string>
): VaultContent[] {
  if (requirement === 'recommendation_letter') {
    if (contacts.length === 0) {
      return [{ type: 'text', value: 'No recommendation contacts saved yet — add one in the Vault tab.' }];
    }
    return contacts.map((c) => ({
      type: 'contact',
      name: c.name,
      email: c.email,
      relationship: c.relationship,
      status: c.status,
    }));
  }

  if (isKnownRequirement(requirement) && requirement !== 'recommendation_letter') {
    const docType = requirement as VaultDocType;
    const matches = documents.filter((d) => d.doc_type === docType);
    if (matches.length === 0) {
      return [{ type: 'text', value: `No ${labelForRequirement(requirement).toLowerCase()} uploaded yet — add one in the Vault tab.` }];
    }
    return matches.map((d) => ({
      type: 'file',
      filename: filenameFromPath(d.storage_path),
      url: signedUrls[d.storage_path] ?? '',
    }));
  }

  // Defensive fallback only -- every real ApplicationRequirement value is
  // handled above per the locked mapping; this guards unexpected/legacy
  // opportunity data rather than silently dropping the requirement.
  return [{ type: 'text', value: `${requirement} — no vault mapping for this requirement.` }];
}
