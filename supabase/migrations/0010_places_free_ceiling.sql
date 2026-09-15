-- Moodbite: lift the Places budget to Google's free ceiling, and no further.
--
-- 0009 set the monthly cap at 900 while the panel needed a tap. It loads on
-- its own now, so the call is made for everybody who reaches a result rather
-- than for the few who asked, and 900 was sized for the quieter world.
--
-- The ceiling is 990, not 3,000 and not 1,000. Google's Text Search Enterprise
-- tier - which is what asking for ratings costs - gives 1,000 free calls a
-- month and bills about $35 per 1,000 after that. 990 leaves ten calls of slack
-- so that the deliberate race in claim_places_call, where two callers can both
-- pass the check, can never be the thing that produces a first invoice. This
-- configuration cannot bill you. That is the whole point of the number.
--
-- The per-client daily cap goes DOWN, from 8 to 5. With the panel loading by
-- itself the budget is spent by whoever arrives rather than by whoever asks,
-- so the scarce thing is now how many different people it reaches. At 5 a
-- client tops out at 150 a month, 15% of the budget, instead of one
-- enthusiastic afternoon taking half of it.
--
-- Belt and braces: set a hard daily quota on the key in the Google Cloud
-- console too. This table is the only thing standing between a bug and a bill,
-- and one guard is not enough for that job.
--
-- Run after 0009_places_quota.sql.

-- One source of truth. 0009 had 900 written into two functions, which is one
-- more place than a number like this should ever live.
create or replace function public.places_monthly_cap()
returns integer
language sql
immutable
as $$ select 990 $$;

comment on function public.places_monthly_cap() is
  'Monthly Google Places budget. Google gives 1,000 free Text Search Enterprise calls a month; this sits just under so the feature cannot bill. Anything above 1,000 costs about $35 per additional 1,000. Change it here and nowhere else.';

revoke all on function public.places_monthly_cap() from public;
grant execute on function public.places_monthly_cap() to anon, authenticated;

create or replace function public.claim_places_call(p_bucket text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  monthly_cap constant integer := public.places_monthly_cap();
  daily_per_client constant integer := 5;
  used_this_month integer;
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

create or replace function public.places_quota_status()
returns table (used_this_month integer, monthly_cap integer, used_today integer)
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
               where u.bucket = '' and u.day = current_date), 0)
  where public.is_admin();
$$;

revoke all on function public.places_quota_status() from public;
grant execute on function public.places_quota_status() to authenticated;
