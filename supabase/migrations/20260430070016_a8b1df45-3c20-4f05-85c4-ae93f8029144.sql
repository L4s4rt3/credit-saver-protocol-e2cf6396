-- Revoke EXECUTE on SECURITY DEFINER helpers from public roles.
-- has_role is only needed by RLS policies (which bypass these grants).
-- handle_new_user is only invoked by the on_auth_user_created trigger.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;