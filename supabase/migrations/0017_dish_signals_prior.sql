-- Moodbite: fix the shrinkage prior in dish_signals.
--
-- 0016 used a prior of 3, chosen before there was any data to choose it
-- against. Running it on the real log showed the mistake immediately.
--
-- Click-through here is about 1%, so a dish shown a handful of times has an
-- EXPECTED click count around 0.02. A prior of 3 is therefore 150 times larger
-- than the quantity it is shrinking. It does not pull the ratio toward the
-- mean, it obliterates it, and what comes out the other side is approximately
--
--     lift ~= 1 + clicked / 3
--
-- which is a click COUNT wearing the costume of a position-debiased rate. The
-- entire point of 0016 - that a dish should be judged against what its
-- positions predicted - was being cancelled by its own prior.
--
-- What it did in practice, on the live log:
--
--     dish            shown  clicked  expected   K=3      K=20
--     idli-sambar         2        1      0.02   1.325    1.049
--     irani-chai          5        1      0.04   1.316    1.048
--     a real winner     500       50      5.00   6.625    2.800
--     a real loser      500        1      5.00   0.500    0.840
--
-- At K=3 one click on two impressions moved a dish +0.049 of a possible
-- +0.075 - most of the maximum, on nothing. At K=20 the same click is worth
-- +0.007 and a dish with fifty clicks across five hundred impressions still
-- saturates, which is the shape this wants: noise ignored, evidence heard.
--
-- Run after 0016_dish_signals.sql.

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
  trials as (
    select i.dish_id, i.rank, (c.dish_id is not null) as won
      from impressions i
      left join clicks c
        on c.shortlist_id = i.shortlist_id
       and c.dish_id = i.dish_id
  ),
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
    -- Gamma(K, K) prior on the rate ratio, mean exactly 1. Raised from 3 to 20
    -- so that it shrinks the ratio rather than replacing it; see the header.
    round(
      (sum(case when t.won then 1 else 0 end) + 20)::numeric
      / nullif(sum(r.p) + 20, 0),
      4
    )
  from trials t
  join by_rank r on r.rank = t.rank
  group by t.dish_id;
$$;

comment on function public.dish_signals() is
  'Per-dish click lift against what its shown positions predicted, shrunk by a Gamma(20,20) prior. 1.0 is neutral and is what an empty log returns. The prior is deliberately large relative to expected click counts, which are small because click-through is around 1%.';

revoke all on function public.dish_signals() from public, anon, authenticated;
grant execute on function public.dish_signals() to anon, authenticated;
