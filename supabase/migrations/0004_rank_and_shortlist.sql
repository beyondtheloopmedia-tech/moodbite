-- Moodbite: which of the four was chosen, and over what.
--
-- The log recorded that a dish was shown and that a dish was clicked, but not
-- where in the shortlist it sat, and not which impressions belonged to the same
-- decision. So the most direct measure of ranking quality - is the top pick the
-- one people take, or do they keep reaching past it - was unanswerable, and a
-- shortlist where nothing appealed was indistinguishable from one never seen.
--
-- Run after 0003_event_context.sql.

-- 1 is the headline pick, 2 and up are the alternates.
alter table public.recommendation_events add column if not exists rank int;

-- Shared by every row from one shortlist: the impressions and any click.
alter table public.recommendation_events add column if not exists shortlist_id uuid;

comment on column public.recommendation_events.rank is
  '1-based position in the shortlist as presented. 1 is the headline pick.';
comment on column public.recommendation_events.shortlist_id is
  'Groups the impressions and any click from a single recommendation into one decision.';

-- "what rank gets clicked" is the question this table now exists to answer
create index if not exists recommendation_events_rank_idx
  on public.recommendation_events (rank, action);

-- and this one makes per-shortlist conversion a cheap lookup
create index if not exists recommendation_events_shortlist_idx
  on public.recommendation_events (shortlist_id);
