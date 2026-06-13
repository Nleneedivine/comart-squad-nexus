
CREATE POLICY "attendance_photos_user_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attendance-photos'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.is_store_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "attendance_photos_user_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-photos'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);
