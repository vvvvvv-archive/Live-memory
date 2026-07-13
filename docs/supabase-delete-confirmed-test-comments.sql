-- Delete only the 4 confirmed deleted test comments before public preview.
--
-- IMPORTANT:
-- - Replace the 4 placeholder UUIDs below with the confirmed comment IDs.
-- - Do not use broad conditions such as deleted_at is not null by themselves.
-- - This SQL intentionally aborts unless exactly 4 target comments are found.
-- - Child replies and related reactions are deleted by existing ON DELETE CASCADE.
-- - Run the SELECT preview first. Run the DELETE block only after confirming the 4 rows.

-- 1. Preview the exact 4 target comments.
with target_comments(id) as (
  values
    ('ebeb16d4-ad89-4fd3-823a-c102efc8e345'::uuid),
    ('864a68d5-8b93-48c5-8128-186c47b606e1'::uuid),
    ('47972342-637d-4f21-9cbb-0fe3a222c4d2'::uuid),
    ('af2ac348-95fa-47c2-8e9d-0aa7b62d7507'::uuid)
)
select
  c.id,
  c.page_key,
  c.parent_id,
  c.nickname,
  left(c.body, 120) as body_preview,
  c.created_at,
  c.updated_at,
  c.deleted_at,
  (
    select count(*)
    from public.prototype_comments child
    where child.parent_id = c.id
  ) as reply_count,
  (
    select count(*)
    from public.prototype_comment_reactions r
    where r.comment_id = c.id
       or r.comment_id in (
        select child.id
        from public.prototype_comments child
        where child.parent_id = c.id
      )
  ) as related_reaction_count
from public.prototype_comments c
join target_comments t
  on t.id = c.id
order by c.created_at;

-- 2. Delete only those 4 confirmed deleted test comments.
--    This block fails if:
--    - fewer/more than 4 IDs are listed,
--    - any ID is missing,
--    - any target is not already deleted by deleted_at or old deleted:{id} page_key.
do $$
declare
  expected_count integer := 4;
  listed_count integer;
  matched_count integer;
  deletable_count integer;
begin
  create temp table target_test_comment_ids(id uuid primary key) on commit drop;

  insert into target_test_comment_ids(id)
  values
    ('ebeb16d4-ad89-4fd3-823a-c102efc8e345'::uuid),
    ('864a68d5-8b93-48c5-8128-186c47b606e1'::uuid),
    ('47972342-637d-4f21-9cbb-0fe3a222c4d2'::uuid),
    ('af2ac348-95fa-47c2-8e9d-0aa7b62d7507'::uuid);

  select count(*)
  into listed_count
  from target_test_comment_ids;

  if listed_count <> expected_count then
    raise exception 'Expected % listed IDs, but got %', expected_count, listed_count;
  end if;

  select count(*)
  into matched_count
  from public.prototype_comments c
  join target_test_comment_ids t
    on t.id = c.id;

  if matched_count <> expected_count then
    raise exception 'Expected % matching comments, but got %', expected_count, matched_count;
  end if;

  select count(*)
  into deletable_count
  from public.prototype_comments c
  join target_test_comment_ids t
    on t.id = c.id
  where c.deleted_at is not null
     or c.page_key like 'deleted:%';

  if deletable_count <> expected_count then
    raise exception 'Expected % already-deleted comments, but got %', expected_count, deletable_count;
  end if;

  delete from public.prototype_comments c
  using target_test_comment_ids t
  where c.id = t.id;

  raise notice 'Deleted % confirmed test comments.', expected_count;
end $$;

-- 3. Confirm they are gone.
with target_comments(id) as (
  values
    ('ebeb16d4-ad89-4fd3-823a-c102efc8e345'::uuid),
    ('864a68d5-8b93-48c5-8128-186c47b606e1'::uuid),
    ('47972342-637d-4f21-9cbb-0fe3a222c4d2'::uuid),
    ('af2ac348-95fa-47c2-8e9d-0aa7b62d7507'::uuid)
)
select count(*) as remaining_target_comments
from public.prototype_comments c
join target_comments t
  on t.id = c.id;
