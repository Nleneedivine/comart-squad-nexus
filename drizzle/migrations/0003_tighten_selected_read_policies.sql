DROP POLICY IF EXISTS "auth view catalog" ON public.integration_catalog;
CREATE POLICY "auth view active catalog" ON public.integration_catalog FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "auth view broadcasts" ON public.broadcasts;

DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Store logos publicly viewable" ON storage.objects;