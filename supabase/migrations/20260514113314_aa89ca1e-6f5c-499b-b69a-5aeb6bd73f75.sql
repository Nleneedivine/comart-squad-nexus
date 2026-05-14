
-- Revoke anon EXECUTE on all SECURITY DEFINER helpers (callers are always authenticated)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_store_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_member_active(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.compute_subscription_amount(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_store_webhook_secret(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.isolation_probe(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.expire_stale_orders() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_daily_reports() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_active(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_subscription_amount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_webhook_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.isolation_probe(uuid, uuid) TO authenticated;

-- Tighten avatars/store-logos SELECT to owner/member only (was: any reader)
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read own or member" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur1
        JOIN public.user_roles ur2 ON ur1.store_id = ur2.store_id
        WHERE ur1.user_id = auth.uid()
          AND ur2.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "store-logos read" ON storage.objects;
CREATE POLICY "store-logos read member" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'store-logos'
    AND public.is_store_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
