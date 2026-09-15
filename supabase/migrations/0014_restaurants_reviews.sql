-- Moodbite: restaurants, and honest reviews of them.
--
-- The turn from "what should I eat" to "where is worth eating", which is a
-- different product with a different trust problem. Three decisions are baked
-- into this schema and all three are hard to undo later.
--
-- 1. THESE LISTINGS ARE OURS.
--    Google's Places terms permit storing a place ID and nothing else - not the
--    name, not the address, not the rating. A review site whose listings were
--    seeded from Places would be built on data it is not allowed to keep, and
--    the remedy is losing the API key. So `restaurants` carries its own name,
--    own address, own everything, and `google_place_id` is a join key for the
--    "find it near me" feature and never a source. Nothing in this application
--    may write a Google-sourced value into any other column of this table.
--
-- 2. SCORES ARE DIMENSIONS, NOT A STAR.
--    A single rating out of five is the thing every competitor already has and
--    it hides exactly what people want to know. Five axes, each answering a
--    question somebody actually asks before going somewhere.
--
-- 3. VERIFICATION IS CLAIMED HONESTLY OR NOT AT ALL.
--    `evidence` records how much we actually know, and the UI must never round
--    that up. "Signed in" is not verification. Being demonstrably at the place
--    when you wrote it is weak evidence, and it is labelled as weak evidence.
--
-- Run after 0013_posts.sql.

-- ------------------------------------------------------------ restaurants ---

create table if not exists public.restaurants (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  -- the neighbourhood people actually say, not the postal address
  area         text,
  address      text,
  -- matches a slug in lib/cities.ts; a text column rather than a foreign key
  -- because that list ships with the application, not the database
  city         text not null,
  lat          double precision,
  lon          double precision,
  cuisines     text[] not null default '{}',
  price_band   smallint check (price_band between 1 and 4),
  veg_only     boolean not null default false,
  -- Join key only. See decision 1 above.
  google_place_id text unique,
  listed       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.restaurants.google_place_id is
  'A join key for the nearby-search feature and nothing else. Google permits storing the ID and forbids storing their name, address or rating. Never populate any other column from a Places response.';
comment on column public.restaurants.listed is
  'False hides it without deleting it, so the reviews attached to it survive.';

create index if not exists restaurants_city_idx on public.restaurants (city, listed);

alter table public.restaurants enable row level security;

drop policy if exists "listed restaurants are public" on public.restaurants;
create policy "listed restaurants are public"
  on public.restaurants for select using (listed = true);

drop policy if exists "admins read every restaurant" on public.restaurants;
create policy "admins read every restaurant"
  on public.restaurants for select using (public.is_admin());

-- Curated, like Glassdoor's employers. Anyone-can-add is how a review site
-- fills with duplicates and businesses that do not exist.
drop policy if exists "admins write restaurants" on public.restaurants;
create policy "admins write restaurants"
  on public.restaurants for insert with check (public.is_admin());

drop policy if exists "admins edit restaurants" on public.restaurants;
create policy "admins edit restaurants"
  on public.restaurants for update using (public.is_admin()) with check (public.is_admin());

drop trigger if exists restaurants_touch_updated_at on public.restaurants;
create trigger restaurants_touch_updated_at
  before update on public.restaurants
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- reviews ---

do $$ begin
  create type public.review_evidence as enum ('none', 'located');
exception when duplicate_object then null; end $$;

comment on type public.review_evidence is
  'How much we actually know about this visit. none = a signed-in person said so. located = their device was near the place when they wrote it, which is weak evidence and must be described as weak.';

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  visited_on    date not null,

  -- Five questions somebody actually asks before going somewhere. 1 to 5.
  hygiene       smallint not null check (hygiene between 1 and 5),
  food          smallint not null check (food between 1 and 5),
  value         smallint not null check (value between 1 and 5),
  as_advertised smallint not null check (as_advertised between 1 and 5),
  wait          smallint not null check (wait between 1 and 5),

  body          text not null default '',
  -- things that are true or not, rather than good or bad: solo-friendly,
  -- late-night, veg-handled-properly and so on. See lib/reviews.ts.
  tags          text[] not null default '{}',

  evidence      public.review_evidence not null default 'none',
  -- hidden by an admin: kept, not deleted, so a pattern of removals is visible
  hidden        boolean not null default false,
  hidden_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One review per person per visit. Without this, one angry evening becomes
  -- five reviews and the average stops meaning anything.
  unique (restaurant_id, author_id, visited_on)
);

comment on column public.reviews.hygiene is 'Visible cleanliness: tables, washroom, staff, kitchen if you can see it.';
comment on column public.reviews.as_advertised is 'Did it match the photos, the menu and the price list. The question no star rating answers.';
comment on column public.reviews.wait is 'How long, scored so that 5 is fast - every axis has to point the same way or the average is nonsense.';

create index if not exists reviews_restaurant_idx on public.reviews (restaurant_id, hidden, created_at desc);
create index if not exists reviews_author_idx on public.reviews (author_id);

alter table public.reviews enable row level security;

drop policy if exists "reviews are public" on public.reviews;
create policy "reviews are public"
  on public.reviews for select using (hidden = false);

drop policy if exists "authors read their own reviews" on public.reviews;
create policy "authors read their own reviews"
  on public.reviews for select using ((select auth.uid()) = author_id);

drop policy if exists "admins read every review" on public.reviews;
create policy "admins read every review"
  on public.reviews for select using (public.is_admin());

-- You may write as yourself and nobody else.
drop policy if exists "write your own review" on public.reviews;
create policy "write your own review"
  on public.reviews for insert with check ((select auth.uid()) = author_id);

drop policy if exists "edit your own review" on public.reviews;
create policy "edit your own review"
  on public.reviews for update
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

drop policy if exists "delete your own review" on public.reviews;
create policy "delete your own review"
  on public.reviews for delete using ((select auth.uid()) = author_id);

-- Admins hide rather than delete, so the record of what was removed survives.
drop policy if exists "admins hide reviews" on public.reviews;
create policy "admins hide reviews"
  on public.reviews for update using (public.is_admin()) with check (public.is_admin());

drop trigger if exists reviews_touch_updated_at on public.reviews;
create trigger reviews_touch_updated_at
  before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- aggregates ---

/*
 * A restaurant's scores, with volume made to earn them.
 *
 * The same shrinkage the nearby-places ranking uses, for the same reason: five
 * out of five from two reviews is not better than four from two hundred, and a
 * plain average puts the two first every time. The prior is small (five
 * reviews) because unlike Google we start with nothing, and a prior that
 * drowns the first ten reviews makes a new listing useless.
 */
create or replace view public.restaurant_scores as
  select
    r.restaurant_id,
    count(*)::integer as reviews,
    round(avg(r.hygiene)::numeric, 2)       as hygiene,
    round(avg(r.food)::numeric, 2)          as food,
    round(avg(r.value)::numeric, 2)         as value,
    round(avg(r.as_advertised)::numeric, 2) as as_advertised,
    round(avg(r.wait)::numeric, 2)          as wait,
    round(
      ((count(*)::numeric / (count(*) + 5)) * avg((r.hygiene + r.food + r.value + r.as_advertised + r.wait) / 5.0)
       + (5::numeric / (count(*) + 5)) * 3.5),
      2
    ) as overall,
    count(*) filter (where r.evidence = 'located')::integer as located_reviews
  from public.reviews r
  where r.hidden = false
  group by r.restaurant_id;

comment on view public.restaurant_scores is
  'Per-restaurant averages plus a shrunk overall. Reads through the reviews policies, so hidden reviews are excluded for everybody and drafts of the truth do not leak.';
