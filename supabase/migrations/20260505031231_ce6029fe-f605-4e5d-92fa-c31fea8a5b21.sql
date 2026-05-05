
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_store_member(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_store_admin(UUID, UUID) FROM authenticated;
