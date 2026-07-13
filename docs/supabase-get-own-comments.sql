-- Add get_own_comments() RPC for the My Memories page.
--
-- This script only adds one RPC function and its EXECUTE permissions.
-- It does not change table data, page_key values, RLS, or direct table SELECT
-- permissions.
--
-- Run this only after reviewing the pre-run checks below.

-- Pre-run checks
-- 1. This should be null before the first install.
select to_regprocedure('public.get_own_comments()') as existing_get_own_comments;

-- 2. Record the current comment count. The count must not change after this
--    script is executed.
select count(*) as prototype_comments_count
from public.prototype_comments;

create or replace function public.get_own_comments()
returns table (
  id uuid,
  page_key text,
  parent_id uuid,
  nickname text,
  body text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  is_reply boolean,
  reactions jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    c.id,
    c.page_key,
    c.parent_id,
    c.nickname,
    c.body,
    c.tags,
    c.created_at,
    c.updated_at,
    c.parent_id is not null as is_reply,
    coalesce(
      (
        select jsonb_object_agg(
          reaction_counts.emoji,
          jsonb_build_object(
            'count', reaction_counts.reaction_count,
            'reacted', reaction_counts.reacted
          )
        )
        from (
          select
            r.emoji,
            count(*)::integer as reaction_count,
            bool_or(r.author_token = public.current_author_token()) as reacted
          from public.prototype_comment_reactions r
          where r.comment_id = c.id
          group by r.emoji
        ) reaction_counts
      ),
      '{}'::jsonb
    ) as reactions
  from public.prototype_comments c
  left join public.prototype_comments parent
    on c.parent_id = parent.id
  where public.current_author_token() <> ''
    and c.author_token = public.current_author_token()
    and c.deleted_at is null
    and c.page_key not like 'deleted:%'
    and (
      c.parent_id is null
      or (
        parent.id is not null
        and parent.deleted_at is null
        and parent.page_key not like 'deleted:%'
      )
    )
  order by c.created_at desc;
$$;

revoke all on function public.get_own_comments() from public;
grant execute on function public.get_own_comments() to anon;

-- Optional future performance index candidate:
-- If comment volume grows and My Memories becomes slow, consider adding:
--
-- create index if not exists prototype_comments_author_token_created_at_idx
-- on public.prototype_comments (author_token, created_at desc)
-- where deleted_at is null;
--
-- The index is intentionally not created by this script.

-- Post-run checks
-- 1. Confirm function existence and return columns. The result type must not
--    include author_token.
select
  p.proname,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_own_comments';

-- 2. Confirm EXECUTE grants. Expected: anon has EXECUTE, PUBLIC does not.
select
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'get_own_comments'
order by grantee, privilege_type;

-- 3. Confirm comment count did not change.
select count(*) as prototype_comments_count
from public.prototype_comments;
