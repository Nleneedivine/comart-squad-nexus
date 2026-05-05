
DROP POLICY IF EXISTS "public submit form" ON public.form_submissions;
CREATE POLICY "public submit active form" ON public.form_submissions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.sales_forms f
            WHERE f.id = form_submissions.form_id
              AND f.store_id = form_submissions.store_id
              AND f.status = 'active')
  );
