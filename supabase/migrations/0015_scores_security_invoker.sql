-- Moodbite: make restaurant_scores obey the policies it claims to obey.
--
-- 0014 commented that the view "reads through the reviews policies". On
-- Postgres 15 and later that is not true by default: a view runs as its owner,
-- not as the caller, so it sees past row level security on the tables beneath
-- it. Nothing leaked - the view exposes only per-restaurant averages and
-- counts, and it filters `hidden = false` itself - but a comment that
-- describes a protection the object does not have is worse than no comment,
-- because the next view gets written the same way over a table where it
-- matters.
--
-- Run after 0014_restaurants_reviews.sql.

alter view public.restaurant_scores set (security_invoker = true);

comment on view public.restaurant_scores is
  'Per-restaurant averages plus a shrunk overall. security_invoker is on, so it genuinely reads under the caller''s policies rather than the owner''s.';
