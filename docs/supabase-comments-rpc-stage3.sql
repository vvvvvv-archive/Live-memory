-- Stage 3: remove direct anon SELECT access from comment tables.
--
-- Purpose:
-- - Prevent public anon clients from directly selecting author_token.
-- - Keep all public comment operations available through Stage 1 RPCs.
-- - Do not change data, table structure, page_key, RLS, or Giscus settings.
--
-- Run only after:
-- - CSV backups are complete.
-- - Stage 1 RPC SQL has been applied successfully.
-- - Stage 2 JavaScript has been deployed and verified.

revoke select on table public.prototype_comments from anon;
revoke select on table public.prototype_comment_reactions from anon;

-- Keep RPC access explicit. These grants are intentionally repeated here so
-- Stage 3 can be reviewed as a complete permission state.
grant execute on function public.current_author_token() to anon;
grant execute on function public.get_public_comments(text) to anon;
grant execute on function public.create_public_comment(text, uuid, text, text, text[]) to anon;
grant execute on function public.update_own_comment(uuid, text, text[]) to anon;
grant execute on function public.delete_own_comment(uuid) to anon;
grant execute on function public.toggle_comment_reaction(uuid, text) to anon;
