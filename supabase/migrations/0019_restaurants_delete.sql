-- Moodbite: let an admin remove a listing.
--
-- 0014 gave admins insert and update on restaurants and no delete, which was an
-- oversight rather than a policy: a listing added by mistake could be unlisted
-- but never removed, so the slug stayed taken forever and the only cure was the
-- SQL editor.
--
-- It also blocks the diagnosis of a save that does nothing. The reliable way to
-- prove a browser can write is to make it write, and that is only acceptable if
-- the row can be taken away again afterwards.
--
-- Deleting a restaurant cascades to its reviews, which is deliberate but sharp:
-- unlisting is the right move for somewhere that has closed, because it keeps
-- the reviews. Delete is for something that should never have been there.
--
-- Run after 0018_anonymous_events.sql.

drop policy if exists "admins delete restaurants" on public.restaurants;
create policy "admins delete restaurants"
  on public.restaurants for delete
  using (public.is_admin());
