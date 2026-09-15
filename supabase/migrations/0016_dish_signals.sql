-- Moodbite: let the engine learn from what people actually pick.
--
-- recommendation_events has been filling up since the beginning and nothing has
-- ever read it back. The dish vectors are hand-tagged guesses; the click stream
-- is the only evidence that ever disagrees with them. This turns that stream
-- into a per-dish correction the scorer can apply.
--
-- THE HARD PART IS POSITION, NOT COUNTING.
--
-- A dish shown first is clicked far more often than the same dish shown fourth.
-- So raw click-through rewards dishes for having ranked well, which is a
-- feedback loop: whatever the engine already favours gets favoured harder,
-- forever, and a dish that never reaches the top is never given the chance to
-- prove it deserved to. The only useful question is whether a dish beat what
-- its POSITION predicted.
--
-- So every impression is charged an expected click equal to the average
-- click-through at the rank it was shown at, and a dish's lift is what it
-- actually got against what it was expected to get. A dish shown only at rank 4
-- and clicked occasionally can out-lift one shown at rank 1 and clicked often.
--
-- Run after 0015_scores_security_invoker.sql.

/*
 * Per-dish lift: 1.0 means exactly as often as its positions predicted,
 * above 1 means better, below means worse.
 *
 * security definer because it aggregates across everybody's events, and no
 * individual can read anybody's but their own. It returns only per-dish counts,
 * so nothing personal crosses that boundary.
 *
 * The shrinkage prior is what stops a single click on a dish shown twice from
 * reading as a triumph. Lift starts at exactly 1 with no data, which is the
 * value that changes no score at all - so an empty log leaves the engine
 * behaving precisely as it did before this existed.
 */
create or replace function public.dish_signals()
returns table (dish_id text, shown integer, clicked integer, expected numeric, lift numeric)
language sql
security definer
set search_path = ''
stable
as $$
  with impressions as (
    select e.dish_id, e.rank, e.shortlist_id
      from public.recommendation_events e
     where e.action = 'shown'
       and e.rank is not null
       and e.shortlist_id is not null
  ),
  clicks as (
    select distinct e.dish_id, e.shortlist_id
      from public.recommendation_events e
     where e.action = 'clicked'
       and e.shortlist_id is not null
  ),
  -- one row per dish per shortlist it appeared in, and whether it won that one
  trials as (
    select i.dish_id,
           i.rank,
           (c.dish_id is not null) as won
      from impressions i
      left join clicks c
        on c.shortlist_id = i.shortlist_id
       and c.dish_id = i.dish_id
  ),
  -- what any dish in that position tends to get, which is the thing a dish
  -- must beat before we credit it with anything
  by_rank as (
    select t.rank, avg(case when t.won then 1 else 0 end)::numeric as p
      from trials t
     group by t.rank
  )
  select
    t.dish_id,
    count(*)::integer,
    sum(case when t.won then 1 else 0 end)::integer,
    round(sum(r.p), 3),
    round(
      (sum(case when t.won then 1 else 0 end) + 3)::numeric
      / nullif(sum(r.p) + 3, 0),
      4
    )
  from trials t
  join by_rank r on r.rank = t.rank
  group by t.dish_id;
$$;

comment on function public.dish_signals() is
  'Per-dish click lift against what its shown positions predicted. 1.0 is neutral and is what an empty log returns, so switching this on changes nothing until there is evidence.';

revoke all on function public.dish_signals() from public, anon, authenticated;
-- Only the server reads this, through the anon role on a route the reader never
-- controls. Granted to anon for that reason and nothing else: it exposes counts
-- per dish, never per person.
grant execute on function public.dish_signals() to anon, authenticated;
