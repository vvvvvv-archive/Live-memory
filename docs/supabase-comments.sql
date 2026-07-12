create extension if not exists pgcrypto;

create table if not exists public.prototype_comments (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  parent_id uuid references public.prototype_comments(id) on delete cascade,
  nickname text not null default '名無しさん',
  body text not null,
  tags text[] not null default '{}',
  author_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.prototype_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.prototype_comments(id) on delete cascade,
  emoji text not null,
  author_token text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, emoji, author_token)
);

alter table public.prototype_comments enable row level security;
alter table public.prototype_comment_reactions enable row level security;

drop policy if exists "prototype comments select visible" on public.prototype_comments;
create policy "prototype comments select visible"
on public.prototype_comments
for select
using (deleted_at is null);

drop policy if exists "prototype comments insert own token" on public.prototype_comments;
create policy "prototype comments insert own token"
on public.prototype_comments
for insert
with check (
  author_token = coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  )
);

drop policy if exists "prototype comments update own token" on public.prototype_comments;
create policy "prototype comments update own token"
on public.prototype_comments
for update
using (
  author_token = coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  )
)
with check (
  author_token = coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  )
);

drop policy if exists "prototype reactions select visible" on public.prototype_comment_reactions;
create policy "prototype reactions select visible"
on public.prototype_comment_reactions
for select
using (true);

drop policy if exists "prototype reactions insert own token" on public.prototype_comment_reactions;
create policy "prototype reactions insert own token"
on public.prototype_comment_reactions
for insert
with check (
  author_token = coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  )
);

drop policy if exists "prototype reactions delete own token" on public.prototype_comment_reactions;
create policy "prototype reactions delete own token"
on public.prototype_comment_reactions
for delete
using (
  author_token = coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  )
);

create index if not exists prototype_comments_page_key_created_at_idx
on public.prototype_comments (page_key, created_at desc);

create index if not exists prototype_comments_parent_id_idx
on public.prototype_comments (parent_id);

create index if not exists prototype_comment_reactions_comment_id_idx
on public.prototype_comment_reactions (comment_id);
