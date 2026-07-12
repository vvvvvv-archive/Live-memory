-- Stage 1: add RPC functions for public comments.
--
-- Purpose:
-- - Add RPCs that do not expose author_token.
-- - Keep the current table permissions unchanged.
-- - Do not revoke anon SELECT yet.
-- - Do not change existing data.
--
-- Run this after taking CSV backups of:
-- - public.prototype_comments
-- - public.prototype_comment_reactions

create or replace function public.current_author_token()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-author-token', ''),
    ''
  );
$$;

create or replace function public.get_public_comments(target_page_key text default null)
returns table (
  id uuid,
  page_key text,
  parent_id uuid,
  nickname text,
  body text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  owned boolean,
  reactions jsonb
)
language sql
security definer
set search_path = public
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
    c.author_token = public.current_author_token() as owned,
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
  where c.deleted_at is null
    and c.page_key not like 'deleted:%'
    and (target_page_key is null or c.page_key = target_page_key)
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

create or replace function public.create_public_comment(
  target_page_key text,
  target_parent_id uuid,
  input_nickname text,
  input_body text,
  input_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := public.current_author_token();
  clean_body text := trim(coalesce(input_body, ''));
  clean_nickname text := coalesce(nullif(trim(coalesce(input_nickname, '')), ''), '名無しさん');
  clean_tags text[] := coalesce(input_tags, '{}');
  new_id uuid;
begin
  if token = '' then
    raise exception 'author token is required';
  end if;

  if trim(coalesce(target_page_key, '')) = '' then
    raise exception 'page_key is required';
  end if;

  if clean_body = '' then
    raise exception 'body is required';
  end if;

  if target_parent_id is not null and not exists (
    select 1
    from public.prototype_comments parent
    where parent.id = target_parent_id
      and parent.page_key = target_page_key
      and parent.parent_id is null
      and parent.deleted_at is null
      and parent.page_key not like 'deleted:%'
  ) then
    raise exception 'valid parent comment is required';
  end if;

  insert into public.prototype_comments (
    page_key,
    parent_id,
    nickname,
    body,
    tags,
    author_token
  )
  values (
    target_page_key,
    target_parent_id,
    left(clean_nickname, 24),
    left(clean_body, 500),
    clean_tags,
    token
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.update_own_comment(
  target_comment_id uuid,
  input_body text,
  input_tags text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := public.current_author_token();
  clean_body text := trim(coalesce(input_body, ''));
  clean_tags text[] := coalesce(input_tags, '{}');
  changed_count integer;
begin
  if token = '' then
    return false;
  end if;

  if clean_body = '' then
    raise exception 'body is required';
  end if;

  update public.prototype_comments
  set
    body = left(clean_body, 500),
    tags = clean_tags,
    updated_at = now()
  where id = target_comment_id
    and author_token = token
    and deleted_at is null
    and page_key not like 'deleted:%';

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.delete_own_comment(target_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := public.current_author_token();
  changed_count integer;
begin
  if token = '' then
    return false;
  end if;

  update public.prototype_comments
  set
    deleted_at = now(),
    updated_at = now()
  where id = target_comment_id
    and author_token = token
    and deleted_at is null
    and page_key not like 'deleted:%';

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.toggle_comment_reaction(
  target_comment_id uuid,
  input_emoji text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := public.current_author_token();
  clean_emoji text := trim(coalesce(input_emoji, ''));
  existing_id uuid;
begin
  if token = '' then
    return false;
  end if;

  if clean_emoji = '' then
    raise exception 'emoji is required';
  end if;

  if not exists (
    select 1
    from public.prototype_comments c
    left join public.prototype_comments parent
      on c.parent_id = parent.id
    where c.id = target_comment_id
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
  ) then
    return false;
  end if;

  select id into existing_id
  from public.prototype_comment_reactions
  where comment_id = target_comment_id
    and emoji = clean_emoji
    and author_token = token
  limit 1;

  if existing_id is not null then
    delete from public.prototype_comment_reactions
    where id = existing_id
      and author_token = token;
    return false;
  end if;

  insert into public.prototype_comment_reactions (
    comment_id,
    emoji,
    author_token
  )
  values (
    target_comment_id,
    clean_emoji,
    token
  );

  return true;
end;
$$;

grant execute on function public.current_author_token() to anon;
grant execute on function public.get_public_comments(text) to anon;
grant execute on function public.create_public_comment(text, uuid, text, text, text[]) to anon;
grant execute on function public.update_own_comment(uuid, text, text[]) to anon;
grant execute on function public.delete_own_comment(uuid) to anon;
grant execute on function public.toggle_comment_reaction(uuid, text) to anon;
