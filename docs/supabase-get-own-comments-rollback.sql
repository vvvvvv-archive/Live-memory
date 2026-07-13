-- Roll back get_own_comments() RPC.
--
-- This removes only the RPC added by docs/supabase-get-own-comments.sql.
-- It does not change existing RPCs, tables, table data, RLS, or table
-- permissions.

do $$
begin
  if to_regprocedure('public.get_own_comments()') is not null then
    revoke all on function public.get_own_comments() from public;
  end if;
end
$$;

drop function if exists public.get_own_comments();

-- Confirmation: this should be null after rollback.
select to_regprocedure('public.get_own_comments()') as existing_get_own_comments;
