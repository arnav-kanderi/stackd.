-- stackd. Section 6 (post-review security fix) — stack_opportunity() and
-- unstack_opportunity() (0020) are atomic and correctly enforce the cap
-- WITHIN the RPC, but nothing stopped a client from bypassing them entirely
-- by calling `supabase.from('stack_items').insert(...)` or `.delete(...)`
-- directly -- the 0006 `for all` RLS policy plus the 0004/0011 grants still
-- let `authenticated` write those operations straight to the table, cap
-- check and row-lock skipped completely. Same class of hole the 0012
-- trigger closed for profiles.subscription_tier, never applied here.
--
-- Fix: revoke insert/delete on stack_items from authenticated. The two RPCs
-- are `security definer` (owned by the migration role, not `authenticated`),
-- so they're unaffected -- all legitimate stacking/unstacking still works
-- exactly as before, only the direct-table bypass is closed. select/update
-- stay granted: the client still needs those for reading stack_items and
-- for checklist-driven status updates (recalculateStatus/markStackd in
-- stack-actions.ts), neither of which goes through an RPC.

revoke insert, delete on stack_items from authenticated;
