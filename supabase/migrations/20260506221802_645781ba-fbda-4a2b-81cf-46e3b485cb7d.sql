GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_store_admin(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.compute_subscription_amount(uuid) TO authenticated, anon;