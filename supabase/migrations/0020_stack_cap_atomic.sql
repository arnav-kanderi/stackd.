-- stackd. Section 6 — atomic 10-item free-tier "Stack It" cap enforcement
-- (spec §3.1, build-plan 06-monetization-gating.md).
--
-- CAP-COUNTING LOGIC (open decision #1 flagged by the spec -- section 3.1's
-- own parenthetical: "lifetime cap unless items are removed/completed --
-- clarify counting logic against stack_count before building"):
--
--   DEFAULT CHOSEN (no user available to confirm mid-build, per this
--   section's build instructions -- FLAG FOR CONFIRMATION):
--     The cap reflects the student's currently-live stack_items count, NOT
--     a lifetime counter. Un-stacking (removing) an item frees a slot.
--     Completing an item ("Stackd") does NOT free a slot -- a completed
--     application consumed real usage (AI match scoring, storage, staff/
--     infra cost) and should keep counting, the same way it would if the
--     student just left it sitting in "Saved" forever.
--   Implementation consequence: profiles.stack_count is repurposed from a
--   monotonic increment-only counter (0008_stack_count_rpc.sql) to a live
--   count that goes up on stack and down on unstack. increment_stack_count
--   is superseded by stack_opportunity() below, which does the cap check
--   and the count update atomically in one transaction -- it is left in
--   place for history/back-compat but no longer called from the app.
--
-- TOCTOU FIX (per WORKFLOW-AND-STATE.md's Section 5 gotcha, which this
-- section was explicitly warned has "the exact same race shape"): a plain
-- "SELECT count(*) from stack_items, then conditionally INSERT" from the
-- client (or even from stack-actions.ts as a two-step client call) would
-- let concurrent "Stack It" taps all read the same pre-insert count and all
-- pass the cap check. Fix: `select ... for update` locks the caller's own
-- profiles row for the duration of the transaction, so concurrent calls for
-- the SAME user serialize -- the second one blocks until the first commits
-- (or rolls back), then sees the post-insert count. This mirrors the same
-- principle Section 5 used (an atomic single-statement reservation that
-- Postgres itself serializes), just via row-lock instead of
-- ON CONFLICT ... WHERE ... RETURNING, since the resource being guarded
-- (stack_items rows) isn't a simple per-day counter row like chat's.

-- checklist_items previously had no ON DELETE behavior on stack_item_id, so
-- unstacking (deleting a stack_items row) would fail with a foreign key
-- violation while checklist rows still reference it. Cascade so unstacking
-- cleans up its checklist rows automatically.
alter table checklist_items drop constraint if exists checklist_items_stack_item_id_fkey;
alter table checklist_items
  add constraint checklist_items_stack_item_id_fkey
  foreign key (stack_item_id) references stack_items(id) on delete cascade;

create or replace function public.stack_opportunity(
  p_user_id uuid,
  p_opportunity_id uuid,
  p_match_score numeric,
  p_match_breakdown jsonb,
  p_cap int default 10
)
returns table(stack_item_id uuid, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_premium boolean;
  v_live_count int;
  v_new_id uuid;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;

  -- Lock this user's profile row for the rest of the transaction. This is
  -- what makes the cap check atomic: a second concurrent call for the same
  -- user blocks here until the first call's transaction finishes.
  select subscription_tier = 'premium' into v_is_premium
  from profiles where id = p_user_id for update;

  if v_is_premium is null then
    raise exception 'profile not found for user %', p_user_id;
  end if;

  if not v_is_premium then
    select count(*) into v_live_count from stack_items where user_id = p_user_id;
    if v_live_count >= p_cap then
      return query select null::uuid, true;
      return;
    end if;
  end if;

  insert into stack_items (user_id, opportunity_id, status, match_score, match_breakdown)
  values (p_user_id, p_opportunity_id, 'Saved', p_match_score, p_match_breakdown)
  returning id into v_new_id;

  update profiles set stack_count = stack_count + 1 where id = p_user_id;

  return query select v_new_id, false;
end;
$$;

grant execute on function public.stack_opportunity(uuid, uuid, numeric, jsonb, int) to authenticated;

-- Un-stacking: frees a cap slot per the counting-logic decision above.
-- Deletes the stack_items row (cascading to checklist_items) and
-- decrements the live count. Locks the same profile row for the same
-- atomicity reason -- an unstack racing a stack for the same user should
-- never leave stack_count out of sync with the real row count.
create or replace function public.unstack_opportunity(p_user_id uuid, p_stack_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;

  perform 1 from profiles where id = p_user_id for update;

  delete from stack_items where id = p_stack_item_id and user_id = p_user_id;

  if not found then
    return false;
  end if;

  update profiles set stack_count = greatest(stack_count - 1, 0) where id = p_user_id;
  return true;
end;
$$;

grant execute on function public.unstack_opportunity(uuid, uuid) to authenticated;
