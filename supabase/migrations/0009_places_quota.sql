-- Moodbite: the spend limiter for Google Places.
--
-- Places is the first thing in this app that costs money per use. Asking for
-- ratings puts the call in Google's Enterprise tier: 1,000 free a month, then
-- $35 per 1,000. Without a durable counter a loop, a scraper or one
-- enthusiastic afternoon turns that into a bill, so the counter is a
-- precondition of the feature rather than a refinement of it. With no Supabase
-- there is nowhere to count, and the route declines to call Google at all.
--
-- Run after 0008_phone.sql.

-- One row per day per bucket. The empty-string bucket is the global total;
-- every other bucket is one hashed client. Raw IPs are never stored - the
-- route hashes them before they get here, because a table of who looked up
-- what food and when is not a thing worth keeping.
create table if not exists public.places_usage (
  day date not null default current_date,
  bucket text not null,
  calls integer not null default 0,
  primary key (day, bucket)
);

comment on table public.places_usage is
  'Google Places call counter. Bucket '''' is the global monthly total; other buckets are salted client hashes used only for per-client fairness.';

-- No policies are defined, so RLS denies everything and the table is
-- unreachable with the anon key. The security definer function below is the
-- only way in.
alter table public.places_usage enable row level security;

-- ------------------------------------------------------------- the claim ----

/*
 * Atomically ask for permission to make one Places call.
 *
 * Returns 'ok', 'month' (the global budget is spent) or 'day' (this client has
 * had its share today). The caller must treat anything but 'ok' as a refusal
 * and must not call Google.
 *
 * The caps live here rather than in an environment variable on purpose: the
 * anon key is public, so anything the client could pass in, an attacker could
 * pass in too. To change them, edit the two constants and re-run this file.
 *
 * MONTHLY_CAP sits just under Google's 1,000 free calls, so the default
 * configuration cannot produce a bill at all. Raising it past 1,000 is a
 * decision to start paying, and should be made alongside a billing budget
 * alert in the Cloud console.
 *
 * Two callers can in principle both pass the check and land one call over the
 * cap. With 100 calls of headroom under the free tier that does not matter,
 * and the alternative is locking a table on every recommendation.
 */
create or replace function public.claim_places_call(p_bucket text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  monthly_cap constant integer := 900;
  daily_per_client constant integer := 8;
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

-- Signed out people use this feature too, so anon has to be able to claim.
-- That does mean someone holding the public anon key can burn the counter
-- deliberately. The damage is that the feature goes quiet, not that money is
-- spent: this thing fails closed, which is the correct direction for a limiter.
revoke all on function public.claim_places_call(text) from public;
grant execute on function public.claim_places_call(text) to anon, authenticated;

-- ------------------------------------------------------------ the gauge ----

-- What the admin panel reads to answer "how much is left". Counts only, no
-- buckets, so it cannot become a way to look up an individual's activity.
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
    900,
    coalesce((select u.calls from public.places_usage u
               where u.bucket = '' and u.day = current_date), 0)
  where public.is_admin();
$$;

revoke all on function public.places_quota_status() from public;
grant execute on function public.places_quota_status() to authenticated;
