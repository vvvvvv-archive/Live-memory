-- Rollback for Stage 3 only.
--
-- Purpose:
-- - Restore the anon SELECT privileges removed in Stage 3.
-- - Do not remove RPC functions.
-- - Do not change data, table structure, RLS, or page_key values.

grant select on table public.prototype_comments to anon;
grant select on table public.prototype_comment_reactions to anon;
