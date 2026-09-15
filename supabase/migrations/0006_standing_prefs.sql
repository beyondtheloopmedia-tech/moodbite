-- Moodbite: the two standing preferences the engine had no way to hear.
--
-- Everything the profile stored until now was either a filter the quiz already
-- asks (diet) or a nudge (interests). These two are different: they change
-- inputs the engine reads on every single recommendation and for which it
-- previously had only one setting for everybody.
--
--   spice_level     the heat axis started at 0.45 for every person alive
--   avoid_cuisines  the engine caps two dishes per cuisine but could never
--                   rule one out, across seventeen of them
--
-- Run after 0005_pro.sql.

alter table public.profiles
  add column if not exists spice_level text
  check (spice_level in ('mild', 'medium', 'hot'));

alter table public.profiles
  add column if not exists avoid_cuisines text[] not null default '{}';

comment on column public.profiles.spice_level is
  'Baseline for the heat axis, replacing the hardcoded 0.45. Mood and weather still move it; the heat slider still overrides it outright.';
comment on column public.profiles.avoid_cuisines is
  'Cuisine names to exclude outright. A hard filter, because "I do not eat that" is not a preference to be weighed.';
