
-- 1) Soft-delete for agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_agents_active ON public.agents(store_id) WHERE deleted_at IS NULL;

-- 2) WhatsApp integrations
CREATE TABLE IF NOT EXISTS public.whatsapp_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE UNIQUE,
  phone_number_id TEXT,
  waba_id TEXT,
  display_phone_number TEXT,
  verified_name TEXT,
  access_token_encrypted TEXT,
  webhook_verify_token TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  last_error TEXT,
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_integrations TO authenticated;
GRANT ALL ON public.whatsapp_integrations TO service_role;
ALTER TABLE public.whatsapp_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_int_read" ON public.whatsapp_integrations FOR SELECT TO authenticated
  USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "wa_int_write" ON public.whatsapp_integrations FOR ALL TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE TRIGGER wa_int_updated_at BEFORE UPDATE ON public.whatsapp_integrations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Use cases
CREATE TABLE IF NOT EXISTS public.whatsapp_use_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, use_case)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_use_cases TO authenticated;
GRANT ALL ON public.whatsapp_use_cases TO service_role;
ALTER TABLE public.whatsapp_use_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_uc_read" ON public.whatsapp_use_cases FOR SELECT TO authenticated
  USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "wa_uc_write" ON public.whatsapp_use_cases FOR ALL TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE TRIGGER wa_uc_updated_at BEFORE UPDATE ON public.whatsapp_use_cases FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'en',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_tpl_read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "wa_tpl_write" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE TRIGGER wa_tpl_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_wa_tpl_store_case ON public.whatsapp_templates(store_id, use_case);

-- 5) Message logs
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound',
  use_case TEXT,
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  to_phone TEXT,
  from_phone TEXT,
  message_body TEXT,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_logs TO authenticated;
GRANT ALL ON public.whatsapp_message_logs TO service_role;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_log_read" ON public.whatsapp_message_logs FOR SELECT TO authenticated
  USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "wa_log_write" ON public.whatsapp_message_logs FOR ALL TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE INDEX IF NOT EXISTS idx_wa_log_store_created ON public.whatsapp_message_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_log_wa_msg_id ON public.whatsapp_message_logs(wa_message_id);

-- 6) Order status trigger: enqueue outbound WA log (payload only, sender picks up)
CREATE OR REPLACE FUNCTION public.tg_orders_wa_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uc RECORD;
  cust_phone TEXT;
  cust_name TEXT;
  use_case_key TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    use_case_key := 'order_updates';
    SELECT is_active INTO uc FROM public.whatsapp_use_cases
      WHERE store_id = NEW.store_id AND use_case = use_case_key;
    IF uc.is_active THEN
      SELECT phone, name INTO cust_phone, cust_name FROM public.customers WHERE id = NEW.customer_id;
      IF cust_phone IS NOT NULL THEN
        INSERT INTO public.whatsapp_message_logs(store_id, direction, use_case, to_phone, message_body, status, payload)
        VALUES (NEW.store_id, 'outbound', use_case_key, cust_phone, NULL, 'queued',
          jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'customer_name', cust_name, 'amount', NEW.amount));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_wa_notify ON public.orders;
CREATE TRIGGER orders_wa_notify AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_wa_notify();
