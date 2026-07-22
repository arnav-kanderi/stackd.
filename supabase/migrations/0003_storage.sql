-- stackd. Section 1 — Storage bucket for the AI Document Vault
-- Path convention: {user_id}/{doc_type}/{filename}
-- Policies pattern-match the leading path segment (the user_id folder) against auth.uid().

insert into storage.buckets (id, name, public)
values ('vault-documents', 'vault-documents', false)
on conflict (id) do nothing;

-- storage.objects.name is the full object path, e.g. "<user_id>/resume/foo.pdf".
-- (storage.foldername(name))[1] extracts the first path segment.

create policy "vault: select own files" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vault: insert own files" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vault: update own files" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vault: delete own files" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
