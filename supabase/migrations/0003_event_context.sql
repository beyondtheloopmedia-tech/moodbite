-- Moodbite: record everything that shaped a recommendation, not a quarter of it.
--
-- recommend() takes nine inputs: six answers, the time slot, the city, the
-- weather, the standing preferences, a fasting flag and the heat slider. The
-- log held four of them, so a row could say what was suggested but not enough
-- to reconstruct why - which makes the click stream unusable for tuning the
-- vectors, the one job it exists to do.
--
-- Run after 0002_admin.sql.

-- the four answers that were missing
alter table public.recommendation_events add column if not exists hunger text;
alter table public.recommendation_events add column if not exists palate text;
alter table public.recommendation_events add column if not exists patience text;
alter table public.recommendation_events add column if not exists diet text;

-- the context the engine reads but the log did not keep
alter table public.recommendation_events add column if not exists weather text;
alter table public.recommendation_events add column if not exists temp_c numeric;
alter table public.recommendation_events add column if not exists day_part text;
alter table public.recommendation_events add column if not exists interests text[];

-- the slider is an explicit correction to what the engine offered, which makes
-- it the most direct signal of the engine being wrong that exists
alter table public.recommendation_events add column if not exists heat_override numeric;

comment on column public.recommendation_events.interests is
  'Standing preferences active at the time, not the ones the profile holds now.';
comment on column public.recommendation_events.heat_override is
  'Heat slider position if the reader moved it. Null means they accepted the default.';
comment on column public.recommendation_events.day_part is
  'The eight-part label driving copy and palette, finer than slot.';

-- The questions worth asking of this table are "what wins in this city", "what
-- wins at this hour" and "what wins in this weather", so index for those.
create index if not exists recommendation_events_city_idx
  on public.recommendation_events (city, action);

create index if not exists recommendation_events_slot_idx
  on public.recommendation_events (slot, action);

create index if not exists recommendation_events_weather_idx
  on public.recommendation_events (weather, action);
