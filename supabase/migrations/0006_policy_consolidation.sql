-- stackd. Section 1 (post-review fix) — collapse 4 CRUD policies per table
-- into a single `for all` policy where using/with-check are identical.
-- Behavior is unchanged: `for all` applies USING to select/update/delete and
-- WITH CHECK to insert/update; Postgres ignores WITH CHECK for select/delete.

-- profiles
drop policy if exists "select own profile" on profiles;
drop policy if exists "insert own profile" on profiles;
drop policy if exists "update own profile" on profiles;
drop policy if exists "delete own profile" on profiles;

create policy "own profile" on profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- user_documents
drop policy if exists "select own rows" on user_documents;
drop policy if exists "insert own rows" on user_documents;
drop policy if exists "update own rows" on user_documents;
drop policy if exists "delete own rows" on user_documents;

create policy "own rows" on user_documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- recommendation_contacts
drop policy if exists "select own rows" on recommendation_contacts;
drop policy if exists "insert own rows" on recommendation_contacts;
drop policy if exists "update own rows" on recommendation_contacts;
drop policy if exists "delete own rows" on recommendation_contacts;

create policy "own rows" on recommendation_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- stack_items
drop policy if exists "select own rows" on stack_items;
drop policy if exists "insert own rows" on stack_items;
drop policy if exists "update own rows" on stack_items;
drop policy if exists "delete own rows" on stack_items;

create policy "own rows" on stack_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- checklist_items (transitive owner via stack_items.user_id)
drop policy if exists "select own rows via stack_item" on checklist_items;
drop policy if exists "insert own rows via stack_item" on checklist_items;
drop policy if exists "update own rows via stack_item" on checklist_items;
drop policy if exists "delete own rows via stack_item" on checklist_items;

create policy "own rows via stack_item" on checklist_items
  for all
  using (public.owns_stack_item(stack_item_id))
  with check (public.owns_stack_item(stack_item_id));

-- chat_messages
drop policy if exists "select own rows" on chat_messages;
drop policy if exists "insert own rows" on chat_messages;
drop policy if exists "update own rows" on chat_messages;
drop policy if exists "delete own rows" on chat_messages;

create policy "own rows" on chat_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- storage.objects (vault-documents bucket)
drop policy if exists "vault: select own files" on storage.objects;
drop policy if exists "vault: insert own files" on storage.objects;
drop policy if exists "vault: update own files" on storage.objects;
drop policy if exists "vault: delete own files" on storage.objects;

create policy "vault: own files" on storage.objects
  for all
  using (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vault-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- opportunities keeps its single select-only policy from 0002_rls.sql untouched.
