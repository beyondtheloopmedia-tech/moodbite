-- Moodbite: the Pro flag.
--
-- No payment state here on purpose. This column records entitlement and
-- nothing else: who has access, not who paid, when, or how much. Billing is a
-- separate concern with its own failure modes, and a boolean that quietly
-- doubles as a receipt is how the two get confused.
--
-- Set by hand in the dashboard for now, exactly like is_admin. Nothing in the
-- application can grant it, so Pro cannot be reached by signing up.
--
-- Run after 0004_rank_and_shortlist.sql.

alter table public.profiles add column if not exists is_pro boolean not null default false;

comment on column public.profiles.is_pro is
  'Entitlement only, never billing state. Granted by hand; nothing in the app can set it.';

-- The activity someone was doing while eating, when they told us. Recorded for
-- everyone, since knowing what people are doing is useful whether or not the
-- feature that uses it is gated.
alter table public.recommendation_events add column if not exists activity text;

comment on column public.recommendation_events.activity is
  'watching | working | company | null. Null means not asked or not answered.';

create index if not exists recommendation_events_activity_idx
  on public.recommendation_events (activity, action);
