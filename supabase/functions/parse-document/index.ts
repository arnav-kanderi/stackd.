// stackd. Section 4 — vault document parsing pipeline (spec §2.4, build-plan
// item 2).
//
// Invoked by the client exactly once per upload (src/lib/vault.ts calls this
// right after a successful storage upload + user_documents insert). Never
// called from a read/view path — that's what guarantees "parse once, cache
// forever until re-upload" without needing extra state columns: the only
// caller is the upload flow itself.
//
// On re-upload of the same doc_type, the client's upload flow deletes the
// old user_documents row (and old storage object) and creates a new one, so
// this function always operates on a fresh row with parsed_content = null.
// There is no "re-parse" code path here by design — re-parsing IS just
// running this function again against the new row.
//
// Downloads the file from the private 'vault-documents' bucket (service
// role, bypasses RLS deliberately — this function already checks the
// caller owns the document below) and asks Claude to extract structured
// content (skills, experience, activities, education) as JSON, cached to
// user_documents.parsed_content.
//
// Deploy: supabase functions deploy parse-document

import { callClaudeJson, hasAnthropicKey } from '../_shared/anthropic-client.ts';
import { createServiceClient, getRequestUserId, handleCorsPreflight, jsonError, jsonOk } from '../_shared/service-client.ts';

const PARSE_SYSTEM_PROMPT = `You extract structured content from a student's vault document (resume, transcript, essay, or activities list) for use in college/internship application matching. Return ONLY valid JSON, no prose, matching this shape:
{
  "summary": string,          // 1-2 sentence summary of the document
  "skills": string[],         // skills/competencies mentioned
  "experience": string[],     // jobs, internships, roles (one line each)
  "activities": string[],     // extracurriculars, clubs, leadership
  "education": string[]       // schools, degrees, coursework, honors
}
Leave arrays empty if the document doesn't contain that kind of information (e.g. an essay has no "skills" list). Do not fabricate content not present in the document.`;

function guessMediaType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'txt') return 'text/plain';
  return 'application/octet-stream';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return jsonError(405, 'POST only');

  const userId = await getRequestUserId(req);
  if (!userId) return jsonError(401, 'Missing or invalid session.');

  let body: { documentId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  if (!body.documentId) return jsonError(400, 'documentId is required.');

  const supabase = createServiceClient();

  const { data: doc, error: docError } = await supabase
    .from('user_documents')
    .select('id, user_id, doc_type, storage_path, parsed_content')
    .eq('id', body.documentId)
    .single();

  if (docError || !doc) return jsonError(404, 'Document not found.');
  if (doc.user_id !== userId) return jsonError(403, 'You do not own this document.');

  // Ownership/existence checks above must run before this so a bad
  // documentId or another user's document always surfaces its real 404/403
  // -- never masked by the (currently permanent, key-not-configured) 501.
  if (!hasAnthropicKey()) {
    const message =
      'AI parsing is not configured on this project (ANTHROPIC_API_KEY secret is missing). The document was uploaded but not parsed.';
    // Persist the reason (0025_vault_parse_error.sql) so the Vault screen can
    // show a real per-document "parsing failed" state instead of the row
    // looking identical to one that's simply never been touched.
    await supabase.from('user_documents').update({ parsed_content_error: message }).eq('id', doc.id);
    return jsonError(501, message);
  }

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('vault-documents')
      .download(doc.storage_path);
    if (downloadError || !fileData) {
      return jsonError(500, `Could not download file: ${downloadError?.message ?? 'unknown error'}`);
    }

    const mediaType = guessMediaType(doc.storage_path);
    const buffer = await fileData.arrayBuffer();

    const content =
      mediaType === 'text/plain'
        ? [{ type: 'text' as const, text: new TextDecoder().decode(buffer) }]
        : [
            {
              type: 'document' as const,
              source: { type: 'base64' as const, media_type: mediaType, data: arrayBufferToBase64(buffer) },
            },
          ];

    const parsed = await callClaudeJson<unknown>(
      {
        system: `${PARSE_SYSTEM_PROMPT}\n\nDocument type: ${doc.doc_type}`,
        content,
        maxTokens: 1024,
      },
      'document parsing'
    );

    const { error: updateError } = await supabase
      .from('user_documents')
      .update({ parsed_content: parsed, parsed_content_error: null, updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    if (updateError) return jsonError(500, updateError.message);

    return jsonOk({ documentId: doc.id, parsed_content: parsed });
  } catch (err) {
    const message = `Parsing failed: ${String(err)}`;
    await supabase.from('user_documents').update({ parsed_content_error: message }).eq('id', doc.id);
    return jsonError(502, message);
  }
});
