-- Moodbite: retire the "spice" standing preference.
--
-- `spice_level` (0006) sets the heat baseline directly, with three levels.
-- Keeping a binary "Chilli, always" interest alongside it put two controls in
-- the same dialog arguing with each other, so the weaker one goes.
--
-- Run after 0006_standing_prefs.sql.

-- profiles hold current state, so the dead value is cleaned out. Reading
-- already tolerated it - parseInterests drops anything unrecognised - but a
-- value that can never be set again should not sit in the column forever.
update public.profiles
   set interests = array_remove(interests, 'spice')
 where 'spice' = any (interests);

-- recommendation_events are deliberately NOT touched. That column records what
-- was true when a recommendation was made, and rewriting history to match the
-- present would make the log useless for the one thing it exists for: telling
-- you why something was suggested at the time.
