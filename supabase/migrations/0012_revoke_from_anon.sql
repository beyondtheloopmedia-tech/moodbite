-- Moodbite: make the revokes mean what they say.
--
-- Since 0002 this codebase has written the pair
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- believing it put a function out of anon's reach. It does not. Supabase sets
-- default privileges that grant EXECUTE on public-schema functions to `anon`
-- and `authenticated` by name, and revoking from PUBLIC does not remove an
-- explicit per-role grant. Demonstrated: is_admin() answers anon with `false`
-- and places_quota_status() answers it with an empty set, despite both lines.
--
-- Nothing leaked. Both functions gate on is_admin() internally, which is false
-- for anon, so the answers were empty rather than wrong. What was wrong was the
-- assurance: a `revoke` that does nothing is worse than no revoke, because the
-- next person to add a function reads it as a working pattern and copies it.
--
-- Run after 0011_places_daily_pacing.sql.

-- The gauge. Nothing evaluates this inside a policy, so anon can lose it
-- outright rather than merely being handed nothing.
revoke all on function public.places_quota_status() from anon;

-- is_admin() is deliberately LEFT reachable by anon, and this is the reason:
-- the admin read policies in 0002 call it from inside `using (...)`. Policies
-- are evaluated as the querying role, so an anon SELECT against profiles or
-- recommendation_events evaluates public.is_admin() as anon. Take EXECUTE away
-- and those queries stop returning zero rows and start raising a permission
-- error instead - a louder, worse failure than the one being fixed. It returns
-- false to anon and that is the whole of its answer, so leaving it is safe.
comment on function public.is_admin() is
  'Executable by anon on purpose: the admin policies in 0002 call it from inside USING clauses, which are evaluated as the querying role. Returns false when there is no session. Do not revoke it from anon without first rewriting those policies.';
