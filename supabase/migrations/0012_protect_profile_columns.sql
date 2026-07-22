-- stackd. Section 2 (post-review security fix) — profiles.subscription_tier,
-- subscription_source, and stack_count are business-logic-critical columns
-- (Section 3's monetization gating depends on subscription_tier;
-- stack_count enforces the free-tier cap). The "own profile" RLS policy
-- (0006_policy_consolidation.sql) only checks row ownership, not which
-- columns changed — so today, any authenticated user can run
-- `supabase.from('profiles').update({ subscription_tier: 'premium' })`
-- directly and grant themselves premium for free, or set stack_count to
-- anything, bypassing increment_stack_count's atomic +1 entirely.
--
-- Fix: a trigger that rejects changes to these columns when the acting
-- Postgres role is `authenticated` (i.e., a direct client call). This does
-- NOT block increment_stack_count (0008_stack_count_rpc.sql) — that function
-- is `security definer`, so `current_user` inside its body is the function's
-- owner (not `authenticated`), and it passes through untouched. It also does
-- not block service_role (e.g. a future Section 6 payment webhook), since
-- current_user there is `service_role`, not `authenticated`.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if new.subscription_tier is distinct from old.subscription_tier then
      raise exception 'subscription_tier cannot be changed directly by the client';
    end if;
    if new.subscription_source is distinct from old.subscription_source then
      raise exception 'subscription_source cannot be changed directly by the client';
    end if;
    if new.stack_count is distinct from old.stack_count then
      raise exception 'stack_count cannot be changed directly by the client — use increment_stack_count()';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns_trigger on profiles;

create trigger protect_profile_columns_trigger
  before update on profiles
  for each row
  execute function public.protect_profile_columns();
