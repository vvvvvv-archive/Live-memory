-- Rollback for Stage 1 RPC additions.
--
-- This removes only the RPC functions added in stage 1.
-- It does not alter tables and does not change existing comment data.

drop function if exists public.toggle_comment_reaction(uuid, text);
drop function if exists public.delete_own_comment(uuid);
drop function if exists public.update_own_comment(uuid, text, text[]);
drop function if exists public.create_public_comment(text, uuid, text, text, text[]);
drop function if exists public.get_public_comments(text);
drop function if exists public.current_author_token();
