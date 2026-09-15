-- Moodbite: writing.
--
-- The first thing in this schema that is published rather than collected.
-- Everything else here belongs to the person it describes and is visible only
-- to them; a post belongs to the site and is visible to everyone, which makes
-- its row level security the mirror image of every other table's:
--
--   profiles / events   private by default, the owner is the exception
--   posts               public by default, the *draft* is the exception
--
-- Run after 0012_revoke_from_anon.sql.

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  -- shown on the index and in link previews; not the first paragraph, because
  -- the sentence that makes somebody click is rarely the one that opens a piece
  excerpt     text,
  body        text not null default '',
  published   boolean not null default false,
  published_at timestamptz,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.posts.slug is
  'The URL. Unique and never reused: changing it breaks every link anyone has already shared.';
comment on column public.posts.published_at is
  'When it first went public, not when it was last edited. Ordering the index by updated_at would shuffle the archive every time a typo is fixed.';

create index if not exists posts_published_idx
  on public.posts (published, published_at desc);

alter table public.posts enable row level security;

-- Anyone, signed in or not, may read a published post. That is the point of it.
drop policy if exists "published posts are public" on public.posts;
create policy "published posts are public"
  on public.posts for select
  using (published = true);

-- Admins additionally see drafts. Policies are OR'd, so this widens rather
-- than replaces the rule above.
drop policy if exists "admins read every post" on public.posts;
create policy "admins read every post"
  on public.posts for select
  using (public.is_admin());

-- Writing is admin-only. Unlike profiles, where the owner writes their own row,
-- there is no owner here to delegate to.
drop policy if exists "admins write posts" on public.posts;
create policy "admins write posts"
  on public.posts for insert
  with check (public.is_admin());

drop policy if exists "admins edit posts" on public.posts;
create policy "admins edit posts"
  on public.posts for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete posts" on public.posts;
create policy "admins delete posts"
  on public.posts for delete
  using (public.is_admin());

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- Stamp published_at the first time a post goes public, and never again. An
-- edit two months later is not a new publication date.
create or replace function public.posts_stamp_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_stamp_published on public.posts;
create trigger posts_stamp_published
  before insert or update on public.posts
  for each row execute function public.posts_stamp_published();
