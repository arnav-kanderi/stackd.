-- stackd. Section 2 — atomic stack_count increment
-- Avoids a client-side read-modify-write race when two "Stack It" taps land
-- concurrently. security definer + explicit auth.uid() check so a caller
-- can only increment their own row (RLS alone wouldn't help here since this
-- is an UPDATE ... SET count = count + 1, not a policy check on new data).

create or replace function public.increment_stack_count(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;

  update profiles
  set stack_count = stack_count + 1
  where id = p_user_id;
end;
$$;

grant execute on function public.increment_stack_count(uuid) to authenticated;
