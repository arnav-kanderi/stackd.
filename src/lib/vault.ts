import * as DocumentPicker from 'expo-document-picker';

import { invokeEdgeFunction } from '@/lib/functions';
import { labelForRequirement } from '@/lib/checklist';
import { supabase } from '@/lib/supabase';

/**
 * AI Document Vault (spec §2.4, build-plan item 1). Storage path
 * convention and bucket are Section 1's ('vault-documents',
 * {user_id}/{doc_type}/{filename}) -- reused verbatim, not redefined.
 */
export type VaultDocType = 'resume' | 'transcript' | 'essay' | 'activity_list';

/**
 * Section metadata shared by every screen that renders the vault's doc
 * types (standalone Vault tab, and the onboarding vault-collection step
 * added per the 2026-07-22 onboarding redesign) -- kept in one place so the
 * two UIs can't silently drift on labels/modes.
 */
export const VAULT_DOC_SECTIONS: { type: VaultDocType; label: string; mode: 'file' | 'text' }[] = [
  { type: 'resume', label: labelForRequirement('resume'), mode: 'file' },
  { type: 'transcript', label: labelForRequirement('transcript'), mode: 'file' },
  { type: 'activity_list', label: labelForRequirement('activity_list'), mode: 'text' },
  { type: 'essay', label: labelForRequirement('essay'), mode: 'text' },
];

export interface ParsedContent {
  summary?: string;
  skills?: string[];
  experience?: string[];
  activities?: string[];
  education?: string[];
}

export interface VaultDocument {
  id: string;
  user_id: string;
  doc_type: VaultDocType;
  storage_path: string;
  parsed_content: ParsedContent | null;
  /** Set by parse-document (0025_vault_parse_error.sql) when the most recent
   * parse attempt failed -- null when parsing has never been attempted or
   * last succeeded. Lets the Vault screen distinguish "never parsed" from
   * "we tried and it failed" instead of showing the same "not parsed yet"
   * label for both. */
  parsed_content_error: string | null;
  updated_at: string;
}

export interface RecommendationContact {
  id: string;
  user_id: string;
  name: string;
  email: string;
  relationship: string;
  status: 'not_requested' | 'requested' | 'received';
}

/** resume/transcript/activity_list are singular per student -- re-upload replaces. Essays are 1..N. */
const SINGULAR_DOC_TYPES: VaultDocType[] = ['resume', 'transcript', 'activity_list'];

export async function fetchVaultDocuments(userId: string): Promise<VaultDocument[]> {
  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return data as VaultDocument[];
}

export async function fetchRecommendationContacts(userId: string): Promise<RecommendationContact[]> {
  const { data, error } = await supabase.from('recommendation_contacts').select('*').eq('user_id', userId);
  if (error || !data) return [];
  return data as RecommendationContact[];
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'txt') return 'text/plain';
  return 'application/octet-stream';
}

/**
 * Uploads a file (or pasted text, wrapped as a .txt blob so the parsing
 * pipeline has a single code path) to the vault-documents bucket, writes
 * the user_documents row, and kicks off parsing exactly once. For singular
 * doc types, replaces any existing document of that type (old storage
 * object + row deleted first) -- that replacement is the "re-upload"
 * trigger the spec calls out as a legitimate re-parse case, not a redundant
 * one.
 */
export async function uploadVaultDocument(
  userId: string,
  docType: VaultDocType,
  file: { uri: string; name: string; mimeType?: string | null; blob?: Blob },
  options?: {
    /** Skip the existing-duplicate lookup for singular doc types. Only safe
     * when the caller already knows this user has no vault rows yet (e.g.
     * onboarding's vault-collection step, for a brand-new profile) -- the
     * standalone Vault tab must never pass this, since a real user may
     * already have a document of this type to replace. */
    skipDedupeCheck?: boolean;
  }
): Promise<{ document: VaultDocument | null; error: string | null }> {
  if (!options?.skipDedupeCheck && SINGULAR_DOC_TYPES.includes(docType)) {
    const existing = await fetchVaultDocuments(userId);
    const dup = existing.filter((d) => d.doc_type === docType);
    for (const d of dup) {
      await deleteVaultDocument(d);
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${docType}/${Date.now()}-${safeName}`;

  let body: Blob | ArrayBuffer;
  if (file.blob) {
    body = file.blob;
  } else {
    const resp = await fetch(file.uri);
    body = await resp.arrayBuffer();
  }

  const { error: uploadError } = await supabase.storage
    .from('vault-documents')
    .upload(storagePath, body, { contentType: file.mimeType ?? guessContentType(file.name), upsert: false });
  if (uploadError) return { document: null, error: uploadError.message };

  const { data: doc, error: insertError } = await supabase
    .from('user_documents')
    .insert({ user_id: userId, doc_type: docType, storage_path: storagePath, parsed_content: null })
    .select()
    .single();

  if (insertError || !doc) {
    await supabase.storage.from('vault-documents').remove([storagePath]);
    return { document: null, error: insertError?.message ?? 'Insert failed' };
  }

  // Fire the parsing pipeline once, right after upload. Failure here (e.g.
  // ANTHROPIC_API_KEY not configured) does not fail the upload -- the doc
  // is saved either way, parsed_content just stays null until parsing
  // succeeds. Never re-invoked from a read/view path.
  const parseError = await triggerDocumentParse(doc.id);

  return { document: doc as VaultDocument, error: parseError };
}

/** Wraps pasted text (used for essays / typed activity lists) as a text/plain upload. */
export async function uploadVaultText(
  userId: string,
  docType: VaultDocType,
  title: string,
  text: string,
  options?: { skipDedupeCheck?: boolean }
): Promise<{ document: VaultDocument | null; error: string | null }> {
  const blob = new Blob([text], { type: 'text/plain' });
  const filename = `${title.replace(/[^a-zA-Z0-9._-]/g, '_') || docType}.txt`;
  return uploadVaultDocument(userId, docType, { uri: '', name: filename, mimeType: 'text/plain', blob }, options);
}

/**
 * Invokes the parse-document Edge Function (server-side, holds the Claude
 * API key -- never called directly from the client). Returns a
 * human-readable error string on failure ("not configured" / network /
 * etc.), or null on success. Non-fatal to the calling upload flow.
 */
export async function triggerDocumentParse(documentId: string): Promise<string | null> {
  const { error } = await invokeEdgeFunction('parse-document', { documentId });
  return error;
}

export async function deleteVaultDocument(doc: VaultDocument): Promise<{ error: string | null }> {
  await supabase.storage.from('vault-documents').remove([doc.storage_path]);
  const { error } = await supabase.from('user_documents').delete().eq('id', doc.id);
  return { error: error?.message ?? null };
}

export async function pickDocumentFile(): Promise<{ uri: string; name: string; mimeType?: string | null } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType };
}

export async function addRecommendationContact(
  userId: string,
  contact: { name: string; email: string; relationship: string }
): Promise<{ contact: RecommendationContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('recommendation_contacts')
    .insert({ user_id: userId, ...contact, status: 'not_requested' })
    .select()
    .single();
  return { contact: (data as RecommendationContact) ?? null, error: error?.message ?? null };
}

export async function updateContactStatus(
  contactId: string,
  status: RecommendationContact['status']
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recommendation_contacts').update({ status }).eq('id', contactId);
  return { error: error?.message ?? null };
}

export async function deleteRecommendationContact(contactId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recommendation_contacts').delete().eq('id', contactId);
  return { error: error?.message ?? null };
}
