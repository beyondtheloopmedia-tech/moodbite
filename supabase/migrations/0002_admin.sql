-- Moodbite: admin read access, and the mood context the click stream was missing.
--
-- Deliberately no service_role anywhere. An admin reads through their own
-- session under the policies below, so there is no key in the application that
-- bypasses row level security and no key whose leak would expose every user.
--
-- Run after 0001_profiles.sql.

-- ------------------------------------------------- email and admin flag ----

-- The email lives in auth.users, which the anon role cannot read. Copying it
-- onto the profile is what lets an admin see who signed up without reaching
-- for a key that bypasses RLS.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants read access to every profile and event. Set by hand in the dashboard; nothing in the app can grant it.';

-- backfill for anyone who signed up before this migration
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- keep it populated from here on
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ------------------------------------------------------- admin identity ----

/*
 * Reading profiles.is_admin from inside a policy ON profiles would recurse.
 * security definer runs this as the owner, outside RLS, which breaks the loop.
 * It is stable and takes no arguments, so it cannot be used to probe rows
 * other than the caller's own.
 */
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------- admin reads ----

-- Policies are OR'd: owners keep their own access, admins gain read-only
-- access on top. No admin write policy exists, deliberately - an admin panel
-- that can rewrite user preferences is a liability, not a feature.
drop policy if exists "admins read every profile" on public.profiles;
create policy "admins read every profile"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "admins read every event" on public.recommendation_events;
create policy "admins read every event"
  on public.recommendation_events for select
  using (public.is_admin());

-- ------------------------------------------------ mood on the event log ----

-- Without these the click stream can say what was ordered but not what mood it
-- was ordered in, which is the question the whole engine exists to answer.
alter table public.recommendation_events add column if not exists mood text;
alter table public.recommendation_events add column if not exists energy text;
alter table public.recommendation_events add column if not exists fasting boolean;

comment on column public.recommendation_events.mood is
  'Answers.mood at the time of the recommendation. Null for rows written before 0002.';

create index if not exists recommendation_events_mood_idx
  on public.recommendation_events (mood, action);
