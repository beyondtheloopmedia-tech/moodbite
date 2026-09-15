-- Moodbite: ration the Places budget across the month instead of by the month.
--
-- 0010 caps the month at 990 and one client at 5 a day, and nothing caps the
-- day globally. "About 33 a day" was arithmetic, not a rule: a hundred people
-- arriving on a Friday could spend a third of the month before dinner, and
-- then the panel is dark for everybody until the month turns.
--
-- It also runs past the guard in the Google console. With a daily quota of 50
-- there, a busy day hits Google's wall first, and a refusal from Google is not
-- a refusal this code can explain - the route can only report that it could
-- not reach the restaurant list, while the admin gauge cheerfully shows 900
-- calls still available. Two limiters disagreeing is worse than either alone,
-- so ours has to bite first and say something true.
--
-- So the day gets an allowance, and it is not a fixed number:
--
--     what is left  /  days still to come
--
-- A quiet day leaves more for tomorrow; a busy one borrows less from it. The
-- budget lasts the month by construction rather than by luck, and the ceiling
-- of 45 keeps every day underneath the Google quota so our message is the one
-- people see.
--
-- Run after 0010_places_free_ceiling.sql.

/*
 * The most calls today may have, given what is left and how long it has to
 * last. Floored so the last days of a nearly spent month are not rationed into
 * uselessness, and capped below the Google console's daily quota so that guard
 * stays a backstop rather than becoming the limiter.
 */
create or replace function public.places_daily_allowance()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  with spent as (
    select coalesce(sum(u.calls), 0)::integer as n
      from public.places_usage u
     where u.bucket = ''
       and u.day >= date_trunc('month', current_date)::date
  ),
  window_ as (
    select
      greatest(public.places_monthly_cap() - (select n from spent), 0) as remaining,
      (date_trunc('month', current_date) + interval '1 month')::date - current_date as days_left
  )
  select least(45, greatest(10, ceil(remaining::numeric / greatest(days_left, 1))::integer))
    from window_;
$$;

comment on function public.places_daily_allowance() is
  'Today''s share of the monthly Places budget: what is left divided by the days still to come, floored at 10 and capped at 45 so it stays under the Google console daily quota.';

-- Granted to nobody. It reads places_usage, which RLS hides from anon, so a
-- direct call by anyone but the owner would confidently return the allowance
-- for a month in which nothing had ever been spent. The only callers that
-- should ever reach it are the two security definer functions below, which run
-- as the owner and therefore see the real numbers.
revoke all on function public.places_daily_allowance() from public, anon, authenticated;

create or replace function public.claim_places_call(p_bucket text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  monthly_cap constant integer := public.places_monthly_cap();
  daily_per_client constant integer := 5;
  daily_global constant integer := public.places_daily_allowance();
  used_this_month integer;
  used_today_global integer;
  used_today integer;
begin
  -- '' is the global row's name; a client must never be able to claim it.
  if p_bucket is null or length(p_bucket) = 0 then
    return 'day';
  end if;

  select coalesce(sum(u.calls), 0) into used_this_month
    from public.places_usage u
   where u.bucket = ''
     and u.day >= date_trunc('month', current_date)::date;

  if used_this_month >= monthly_cap then
    return 'month';
  end if;

  select coalesce(u.calls, 0) into used_today_global
    from public.places_usage u
   where u.bucket = ''
     and u.day = current_date;

  -- Today's share is spent. 'day' rather than 'month' because the honest thing
  -- to tell somebody is to come back tomorrow, which is true: there will be
  -- more then.
  if coalesce(used_today_global, 0) >= daily_global then
    return 'day';
  end if;

  select coalesce(u.calls, 0) into used_today
    from public.places_usage u
   where u.bucket = p_bucket
     and u.day = current_date;

  if coalesce(used_today, 0) >= daily_per_client then
    return 'day';
  end if;

  insert into public.places_usage (day, bucket, calls)
       values (current_date, '', 1)
  on conflict (day, bucket) do update set calls = public.places_usage.calls + 1;

  insert into public.places_usage (day, bucket, calls)
       values (current_date, p_bucket, 1)
  on conflict (day, bucket) do update set calls = public.places_usage.calls + 1;

  return 'ok';
end;
$$;

revoke all on function public.claim_places_call(text) from public;
grant execute on function public.claim_places_call(text) to anon, authenticated;

-- The gauge gains today's allowance, so the admin page can say how much of
-- today is left rather than only how much of the month.
--
-- Dropped first, not replaced. Adding a column to a RETURNS TABLE changes the
-- function's row type, and `create or replace` refuses that outright:
--   ERROR 42P13: cannot change return type of existing function
-- The drop takes its grants with it, so they are reissued below.
drop function if exists public.places_quota_status();

create or replace function public.places_quota_status()
returns table (
  used_this_month integer,
  monthly_cap integer,
  used_today integer,
  daily_allowance integer
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    coalesce((select sum(u.calls)::integer from public.places_usage u
               where u.bucket = '' and u.day >= date_trunc('month', current_date)::date), 0),
    public.places_monthly_cap(),
    coalesce((select u.calls from public.places_usage u
               where u.bucket = '' and u.day = current_date), 0),
    public.places_daily_allowance()
  where public.is_admin();
$$;

revoke all on function public.places_quota_status() from public;
grant execute on function public.places_quota_status() to authenticated;
