
-- Create public storage buckets for avatars and store logos
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('store-logos', 'store-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars: anyone can view, users manage their own folder (auth.uid()/...)
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Avatars are publicly viewable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Store logos: public viewable; only store members (path: store_id/...) manage
DROP POLICY IF EXISTS "Store logos publicly viewable" ON storage.objects;
CREATE POLICY "Store logos publicly viewable" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "Store members upload logo" ON storage.objects;
CREATE POLICY "Store members upload logo" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'store-logos' AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "Store members update logo" ON storage.objects;
CREATE POLICY "Store members update logo" ON storage.objects
  FOR UPDATE USING (bucket_id = 'store-logos' AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "Store members delete logo" ON storage.objects;
CREATE POLICY "Store members delete logo" ON storage.objects
  FOR DELETE USING (bucket_id = 'store-logos' AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));
