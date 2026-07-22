-- stackd. Section 1 — Row Level Security
-- Every table gets RLS enabled. User-owned tables are scoped to auth.uid().
-- checklist_items has no user_id column; ownership is transitive through
-- stack_items.user_id, enforced via a security-definer helper function.
-- opportunities is read-only for authenticated users (is_active = true) and
-- has no client-side insert/update/delete policy at all.

-- ---------------------------------------------------------------------------
-- Helper: does the given stack_item belong to the calling user?
-- security definer so it can read stack_items regardless of the caller's own
-- RLS visibility, then the caller-facing checklist_items policy uses it.
-- ---------------------------------------------------------------------------
create or replace function public.owns_stack_item(p_stack_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from stack_items si
    where si.id = p_stack_item_id
      and si.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles (owner column: id)
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

create policy "select own profile" on profiles
  for select using (auth.uid() = id);

create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "update own profile" on profiles
  for update using (auth.uid() = id);

create policy "delete own profile" on profiles
  for delete using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- user_documents (owner column: user_id)
-- ---------------------------------------------------------------------------
alter table user_documents enable row level security;

create policy "select own rows" on user_documents
  for select using (auth.uid() = user_id);

create policy "insert own rows" on user_documents
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on user_documents
  for update using (auth.uid() = user_id);

create policy "delete own rows" on user_documents
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- recommendation_contacts (owner column: user_id)
-- ---------------------------------------------------------------------------
alter table recommendation_contacts enable row level security;

create policy "select own rows" on recommendation_contacts
  for select using (auth.uid() = user_id);

create policy "insert own rows" on recommendation_contacts
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on recommendation_contacts
  for update using (auth.uid() = user_id);

create policy "delete own rows" on recommendation_contacts
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- stack_items (owner column: user_id)
-- ---------------------------------------------------------------------------
alter table stack_items enable row level security;

create policy "select own rows" on stack_items
  for select using (auth.uid() = user_id);

create policy "insert own rows" on stack_items
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on stack_items
  for update using (auth.uid() = user_id);

create policy "delete own rows" on stack_items
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- checklist_items (transitive owner via stack_items.user_id)
-- ---------------------------------------------------------------------------
alter table checklist_items enable row level security;

create policy "select own rows via stack_item" on checklist_items
  for select using (public.owns_stack_item(stack_item_id));

create policy "insert own rows via stack_item" on checklist_items
  for insert with check (public.owns_stack_item(stack_item_id));

create policy "update own rows via stack_item" on checklist_items
  for update using (public.owns_stack_item(stack_item_id));

create policy "delete own rows via stack_item" on checklist_items
  for delete using (public.owns_stack_item(stack_item_id));

-- ---------------------------------------------------------------------------
-- chat_messages (owner column: user_id)
-- ---------------------------------------------------------------------------
alter table chat_messages enable row level security;

create policy "select own rows" on chat_messages
  for select using (auth.uid() = user_id);

create policy "insert own rows" on chat_messages
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on chat_messages
  for update using (auth.uid() = user_id);

create policy "delete own rows" on chat_messages
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- opportunities (read-only for authenticated users; no client writes at all)
-- ---------------------------------------------------------------------------
alter table opportunities enable row level security;

create policy "select active opportunities" on opportunities
  for select
  to authenticated
  using (is_active = true);
