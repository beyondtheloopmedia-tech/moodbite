-- Moodbite: profiles and the click stream.
--
-- Two tables. `profiles` holds standing preferences (what you like in general),
-- `recommendation_events` holds what was actually shown and clicked, which is
-- the data that lets the dish vectors be tuned instead of guessed.
--
-- Every policy is written so a row is only ever visible to the user it belongs
-- to. There is no "read all" path, including for the click stream.

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  interests   text[] not null default '{}',
  diet        text check (diet in ('veg', 'egg', 'anything')),
  home_city   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Standing preferences. Nudges the target vector; never overrides the six answers.';
comment on column public.profiles.interests is
  'InterestId values from lib/interests.ts. Unknown values are ignored on read.';
comment on column public.profiles.home_city is
  'A city slug from lib/cities.ts. Used as the default when geolocation is unavailable.';

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "profiles are insertable by their owner" on public.profiles;
create policy "profiles are insertable by their owner"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles are deletable by their owner" on public.profiles;
create policy "profiles are deletable by their owner"
  on public.profiles for delete
  using ((select auth.uid()) = id);

-- --------------------------------------------------------- click stream ----

create table if not exists public.recommendation_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  dish_id    text not null,
  city       text,
  slot       text,
  -- 'shown' for everything in the shortlist, 'clicked' when an order link is
  -- followed. The ratio between them is the signal worth having.
  action     text not null check (action in ('shown', 'clicked')),
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_user_time_idx
  on public.recommendation_events (user_id, created_at desc);

create index if not exists recommendation_events_dish_idx
  on public.recommendation_events (dish_id, action);

alter table public.recommendation_events enable row level security;

drop policy if exists "events are readable by their owner" on public.recommendation_events;
create policy "events are readable by their owner"
  on public.recommendation_events for select
  using ((select auth.uid()) = user_id);

drop policy if exists "events are insertable by their owner" on public.recommendation_events;
create policy "events are insertable by their owner"
  on public.recommendation_events for insert
  with check ((select auth.uid()) = user_id);

-- Deliberately no update or delete policy: an event log that can be rewritten
-- is not evidence of anything.

-- -------------------------------------------------------------- triggers ---

-- A profile row for every new user, so the app never has to handle "signed in
-- but has no profile" as a separate state.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
