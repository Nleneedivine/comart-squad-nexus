
-- Message templates (WhatsApp / email / SMS)
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp', -- whatsapp | email | sms
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view templates" ON public.message_templates
  FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert templates" ON public.message_templates
  FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage templates" ON public.message_templates
  FOR ALL USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));

CREATE TRIGGER tg_message_templates_updated
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-expire pending orders older than 7 days
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'cancelled', expire_pending = true
  WHERE status = 'pending'
    AND created_at < now() - interval '7 days'
    AND is_archived = false;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily at 03:00 UTC (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-orders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-orders',
  '0 3 * * *',
  $$ SELECT public.expire_stale_orders(); $$
);
