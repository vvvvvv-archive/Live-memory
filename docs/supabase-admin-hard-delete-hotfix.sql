-- Hotfix: make admin hard delete available to the admin page.
--
-- Run this manually in Supabase SQL Editor.
-- This file only creates/replaces admin_hard_delete_comment(uuid), grants
-- execute to authenticated, revokes it from anon, and refreshes PostgREST's
-- schema cache. It does not change public comment behavior.

-- 1. Check whether the RPC is visible before applying this hotfix.
select to_regprocedure('public.admin_hard_delete_comment(uuid)') as existing_admin_hard_delete_comment;

-- 2. Confirm FK behavior. The RPC below also deletes related rows explicitly,
-- so it does not rely only on CASCADE.
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

-- 3. Create/replace the UUID RPC used by admin-comments.js.
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

revoke all on function public.admin_hard_delete_comment(uuid) from public;
revoke all on function public.admin_hard_delete_comment(uuid) from anon;
grant execute on function public.admin_hard_delete_comment(uuid) to authenticated;

-- 4. Ask PostgREST to refresh its schema cache.
notify pgrst, 'reload schema';

-- 5. Post-run checks.
select to_regprocedure('public.admin_hard_delete_comment(uuid)') as existing_admin_hard_delete_comment;

select
  has_function_privilege('anon', 'public.admin_hard_delete_comment(uuid)', 'execute') as anon_can_admin_hard_delete,
  has_function_privilege('authenticated', 'public.admin_hard_delete_comment(uuid)', 'execute') as authenticated_can_admin_hard_delete;
