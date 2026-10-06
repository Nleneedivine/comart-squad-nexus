-- WhatsApp configuration and logs are integration-management data.
-- Credential rows were already made server-only; extend the same boundary to
-- use-case configuration, templates, and message history.

DROP POLICY IF EXISTS "wa_uc_read" ON public.whatsapp_use_cases;
DROP POLICY IF EXISTS "wa_uc_write" ON public.whatsapp_use_cases;
CREATE POLICY "wa use cases view by permission"
  ON public.whatsapp_use_cases FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'));
CREATE POLICY "wa use cases manage by permission"
  ON public.whatsapp_use_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'integrations.manage'));
CREATE POLICY "wa use cases update by permission"
  ON public.whatsapp_use_cases FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'integrations.manage'));
CREATE POLICY "wa use cases delete by permission"
  ON public.whatsapp_use_cases FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'));

DROP POLICY IF EXISTS "wa_tpl_read" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "wa_tpl_write" ON public.whatsapp_templates;
CREATE POLICY "wa templates view by permission"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'));
CREATE POLICY "wa templates insert by permission"
  ON public.whatsapp_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), store_id, 'integrations.manage')
    AND created_by = auth.uid()
  );
CREATE POLICY "wa templates update by permission"
  ON public.whatsapp_templates FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'integrations.manage'));
CREATE POLICY "wa templates delete by permission"
  ON public.whatsapp_templates FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'));

DROP POLICY IF EXISTS "wa_log_read" ON public.whatsapp_message_logs;
DROP POLICY IF EXISTS "wa_log_write" ON public.whatsapp_message_logs;
CREATE POLICY "wa logs view by permission"
  ON public.whatsapp_message_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'integrations.manage'));

REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_message_logs FROM authenticated;
