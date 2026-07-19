-- Admin comments foundation for V6 LIVE MEMORY.
--
-- Purpose:
-- - Add a Supabase Auth based admin allow-list.
-- - Add read-only admin RPCs for paginated comment review.
-- - Do not change existing public comment RPCs, data, page_key values, or RLS.
--
-- Run this manually in Supabase SQL Editor after reviewing the whole file.
-- Do not commit a real admin user_id or email address. Use YOUR_ADMIN_USER_UUID
-- as a placeholder in this public repository.

-- ============================================================
-- 1. Pre-run checks
-- ============================================================

-- Check whether admin objects already exist.
select to_regclass('public.admin_users') as existing_admin_users_table;
select to_regprocedure('public.is_comment_admin()') as existing_is_comment_admin_rpc;
select to_regprocedure('public.get_admin_comments(integer, integer)') as existing_get_admin_comments_rpc;

-- Confirm existing comment tables.
select to_regclass('public.prototype_comments') as comments_table;
select to_regclass('public.prototype_comment_reactions') as reactions_table;

-- Confirm current RLS status.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'prototype_comments',
    'prototype_comment_reactions',
    'admin_users'
  )
order by tablename;

-- Confirm the admin user_id exists in Supabase Auth before registration.
-- Replace YOUR_ADMIN_USER_UUID only inside Supabase SQL Editor.
select id, email, created_at
from auth.users
where id = 'YOUR_ADMIN_USER_UUID'::uuid;

-- Current row counts.
select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;

-- ============================================================
-- 2. Admin allow-list table
-- ============================================================

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- No direct table access from browser roles.
revoke all on table public.admin_users from anon;
revoke all on table public.admin_users from authenticated;

-- Do not add broad SELECT policies for admin_users.
-- Admin checks are performed inside SECURITY DEFINER RPCs.

-- ============================================================
-- 3. Admin registration SQL
-- ============================================================

-- Replace YOUR_ADMIN_USER_UUID in Supabase SQL Editor after confirming it
-- exists in auth.users. Do not commit the real value to GitHub.
--
-- insert into public.admin_users (user_id)
-- values ('YOUR_ADMIN_USER_UUID'::uuid)
-- on conflict (user_id) do nothing;

-- ============================================================
-- 4. Admin check RPC
-- ============================================================

create function public.is_comment_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  );
$$;

revoke all on function public.is_comment_admin() from public;
revoke all on function public.is_comment_admin() from anon;
grant execute on function public.is_comment_admin() to authenticated;

-- ============================================================
-- 5. Read-only admin comments RPC
-- ============================================================

create function public.get_admin_comments(
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  id uuid,
  page_key text,
  parent_id uuid,
  nickname text,
  body text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  is_reply boolean,
  parent_nickname text,
  parent_body text,
  parent_created_at timestamptz,
  reactions jsonb,
  reaction_total integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 50);
  safe_offset integer := greatest(coalesce(result_offset, 0), 0);
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    c.id,
    c.page_key,
    c.parent_id,
    c.nickname,
    c.body,
    c.tags,
    c.created_at,
    c.updated_at,
    c.deleted_at,
    (c.parent_id is not null) as is_reply,
    parent.nickname as parent_nickname,
    parent.body as parent_body,
    parent.created_at as parent_created_at,
    coalesce(
      (
        select jsonb_object_agg(
          reaction_counts.emoji,
          jsonb_build_object('count', reaction_counts.reaction_count)
        )
        from (
          select
            r.emoji,
            count(*)::integer as reaction_count
          from public.prototype_comment_reactions r
          where r.comment_id = c.id
          group by r.emoji
        ) reaction_counts
      ),
      '{}'::jsonb
    ) as reactions,
    coalesce(
      (
        select count(*)::integer
        from public.prototype_comment_reactions r
        where r.comment_id = c.id
      ),
      0
    ) as reaction_total
  from public.prototype_comments c
  left join public.prototype_comments parent
    on parent.id = c.parent_id
  order by c.created_at desc, c.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.get_admin_comments(integer, integer) from public;
revoke all on function public.get_admin_comments(integer, integer) from anon;
grant execute on function public.get_admin_comments(integer, integer) to authenticated;

-- ============================================================
-- 6. Post-run checks
-- ============================================================

-- Confirm function privileges.
select
  has_function_privilege('anon', 'public.is_comment_admin()', 'execute') as anon_can_is_comment_admin,
  has_function_privilege('authenticated', 'public.is_comment_admin()', 'execute') as authenticated_can_is_comment_admin,
  has_function_privilege('anon', 'public.get_admin_comments(integer, integer)', 'execute') as anon_can_get_admin_comments,
  has_function_privilege('authenticated', 'public.get_admin_comments(integer, integer)', 'execute') as authenticated_can_get_admin_comments;

-- Confirm admin_users remains unavailable to browser roles.
select
  has_table_privilege('anon', 'public.admin_users', 'select') as anon_can_select_admin_users,
  has_table_privilege('authenticated', 'public.admin_users', 'select') as authenticated_can_select_admin_users;

-- Confirm admin allow-list count. This should be 0 before manual registration,
-- and 1 after registering the admin user.
select count(*) as admin_users_count
from public.admin_users;

-- Confirm the public comment counts did not change.
select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;

-- ============================================================
-- 7. Rollback
-- ============================================================

-- Use only if the admin comments feature must be removed.
-- This does not change public comment tables or data.
--
-- revoke all on function public.get_admin_comments(integer, integer) from public;
-- drop function if exists public.get_admin_comments(integer, integer);
--
-- revoke all on function public.is_comment_admin() from public;
-- drop function if exists public.is_comment_admin();
--
-- drop table if exists public.admin_users;
