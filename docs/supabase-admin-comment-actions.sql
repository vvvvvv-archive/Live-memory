-- Add admin comment moderation RPCs.
--
-- Run this manually in Supabase SQL Editor.
-- This file does not change public comment display RPCs except adding the
-- status-filtered overload of get_admin_comments().

-- ============================================================
-- 1. Confirm current state
-- ============================================================

select to_regprocedure('public.admin_hard_delete_comment(uuid)') as existing_admin_hard_delete_comment;
select to_regprocedure('public.admin_soft_delete_comment(uuid)') as existing_admin_soft_delete_comment;
select to_regprocedure('public.admin_restore_comment(uuid)') as existing_admin_restore_comment;
select to_regprocedure('public.get_admin_comments(integer, integer, text)') as existing_get_admin_comments_with_status;

select
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
 and rc.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in (
    'prototype_comments',
    'prototype_comment_reactions'
  )
order by tc.table_name, kcu.column_name;

select
  has_table_privilege('anon', 'public.prototype_comments', 'delete') as anon_can_delete_comments,
  has_table_privilege('authenticated', 'public.prototype_comments', 'delete') as authenticated_can_delete_comments,
  has_table_privilege('anon', 'public.prototype_comment_reactions', 'delete') as anon_can_delete_reactions,
  has_table_privilege('authenticated', 'public.prototype_comment_reactions', 'delete') as authenticated_can_delete_reactions;

-- ============================================================
-- 2. Status-filtered admin comments RPC
-- ============================================================

create or replace function public.get_admin_comments(
  result_limit integer,
  result_offset integer,
  status_filter text
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
  reaction_total integer,
  child_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 50);
  safe_offset integer := greatest(coalesce(result_offset, 0), 0);
  safe_status text := coalesce(nullif(trim(status_filter), ''), 'all');
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

  if safe_status not in ('all', 'visible', 'hidden') then
    safe_status := 'all';
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
    ) as reaction_total,
    coalesce(
      (
        select count(*)::integer
        from public.prototype_comments child
        where child.parent_id = c.id
      ),
      0
    ) as child_count
  from public.prototype_comments c
  left join public.prototype_comments parent
    on parent.id = c.parent_id
  where (
      safe_status = 'all'
      or (safe_status = 'visible' and c.deleted_at is null)
      or (safe_status = 'hidden' and c.deleted_at is not null)
    )
  order by
    case when safe_status = 'hidden' then c.deleted_at end desc nulls last,
    c.created_at desc,
    c.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.get_admin_comments(integer, integer, text) from public;
revoke all on function public.get_admin_comments(integer, integer, text) from anon;
grant execute on function public.get_admin_comments(integer, integer, text) to authenticated;

-- ============================================================
-- 3. Admin moderation RPCs
-- ============================================================

create or replace function public.admin_soft_delete_comment(target_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    return false;
  end if;

  update public.prototype_comments
  set
    deleted_at = now(),
    updated_at = now()
  where id = target_comment_id
    and deleted_at is null;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.admin_restore_comment(target_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    return false;
  end if;

  update public.prototype_comments
  set
    deleted_at = null,
    updated_at = now()
  where id = target_comment_id
    and deleted_at is not null;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.admin_hard_delete_comment(target_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.admin_users admin_user
    where admin_user.user_id = auth.uid()
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.prototype_comments c
    where c.id = target_comment_id
  ) then
    return false;
  end if;

  -- The current intended schema uses ON DELETE CASCADE, but this explicit
  -- recursive deletion keeps the operation safe even if an older FK is not
  -- cascade-enabled. Parent hard delete removes its replies; reply hard delete
  -- removes only that reply subtree.
  with recursive delete_targets as (
    select c.id
    from public.prototype_comments c
    where c.id = target_comment_id

    union all

    select child.id
    from public.prototype_comments child
    join delete_targets parent_target
      on child.parent_id = parent_target.id
  ),
  deleted_reactions as (
    delete from public.prototype_comment_reactions r
    using delete_targets target
    where r.comment_id = target.id
    returning r.id
  )
  delete from public.prototype_comments c
  using delete_targets target
  where c.id = target.id;

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

revoke all on function public.admin_soft_delete_comment(uuid) from public;
revoke all on function public.admin_soft_delete_comment(uuid) from anon;
grant execute on function public.admin_soft_delete_comment(uuid) to authenticated;

revoke all on function public.admin_restore_comment(uuid) from public;
revoke all on function public.admin_restore_comment(uuid) from anon;
grant execute on function public.admin_restore_comment(uuid) to authenticated;

revoke all on function public.admin_hard_delete_comment(uuid) from public;
revoke all on function public.admin_hard_delete_comment(uuid) from anon;
grant execute on function public.admin_hard_delete_comment(uuid) to authenticated;

-- ============================================================
-- 4. Post-run checks
-- ============================================================

select
  has_function_privilege('anon', 'public.get_admin_comments(integer, integer, text)', 'execute') as anon_can_get_admin_comments_with_status,
  has_function_privilege('authenticated', 'public.get_admin_comments(integer, integer, text)', 'execute') as authenticated_can_get_admin_comments_with_status,
  has_function_privilege('anon', 'public.admin_soft_delete_comment(uuid)', 'execute') as anon_can_admin_soft_delete,
  has_function_privilege('authenticated', 'public.admin_soft_delete_comment(uuid)', 'execute') as authenticated_can_admin_soft_delete,
  has_function_privilege('anon', 'public.admin_restore_comment(uuid)', 'execute') as anon_can_admin_restore,
  has_function_privilege('authenticated', 'public.admin_restore_comment(uuid)', 'execute') as authenticated_can_admin_restore,
  has_function_privilege('anon', 'public.admin_hard_delete_comment(uuid)', 'execute') as anon_can_admin_hard_delete,
  has_function_privilege('authenticated', 'public.admin_hard_delete_comment(uuid)', 'execute') as authenticated_can_admin_hard_delete;

select to_regprocedure('public.admin_hard_delete_comment(uuid)') as existing_admin_hard_delete_comment;

-- ============================================================
-- 5. Rollback
-- ============================================================

-- revoke all on function public.admin_hard_delete_comment(uuid) from public;
-- drop function if exists public.admin_hard_delete_comment(uuid);
--
-- revoke all on function public.admin_restore_comment(uuid) from public;
-- drop function if exists public.admin_restore_comment(uuid);
--
-- revoke all on function public.admin_soft_delete_comment(uuid) from public;
-- drop function if exists public.admin_soft_delete_comment(uuid);
--
-- revoke all on function public.get_admin_comments(integer, integer, text) from public;
-- drop function if exists public.get_admin_comments(integer, integer, text);
