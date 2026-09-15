-- Moodbite: recreate the read policies on restaurants.
--
-- The evidence, gathered one step at a time:
--
--   an admin's plain insert           succeeds
--   an admin reading that row back    0 rows
--   the same policy shape on posts    works
--
-- So the write policy from 0014 is present and doing its job, and something
-- about the read side is not. Every consistent explanation - the policy never
-- created, created against something other than is_admin(), or dropped by a
-- later run - is repaired by the same three statements, and none of them is
-- worth another round of diagnosis to tell apart when the cure is identical.
--
-- Safe to run whether or not anything is wrong. `drop policy if exists`
-- followed by `create policy` leaves exactly the intended state either way, and
-- both are the same definitions 0014 was supposed to leave behind. If the
-- policies were already correct this file changes nothing at all.
--
-- Why it mattered more than a hidden row: insert().select().single() is ONE
-- request that writes and then reads, and PostgREST rolls the whole thing back
-- when the read returns nothing. So an unreadable row was not merely invisible,
-- it was undone - which is why every save vanished leaving no trace of either
-- success or failure. The client no longer works that way, but the policy
-- should still be right.
--
-- Run after 0019_restaurants_delete.sql.

drop policy if exists "listed restaurants are public" on public.restaurants;
create policy "listed restaurants are public"
  on public.restaurants for select
  using (listed = true);

drop policy if exists "admins read every restaurant" on public.restaurants;
create policy "admins read every restaurant"
  on public.restaurants for select
  using (public.is_admin());

-- The same pair for reviews, which were written in the same migration and by
-- the same hand, and would fail the same way without anybody noticing until
-- somebody tried to read a hidden review.
drop policy if exists "reviews are public" on public.reviews;
create policy "reviews are public"
  on public.reviews for select
  using (hidden = false);

drop policy if exists "admins read every review" on public.reviews;
create policy "admins read every review"
  on public.reviews for select
  using (public.is_admin());
