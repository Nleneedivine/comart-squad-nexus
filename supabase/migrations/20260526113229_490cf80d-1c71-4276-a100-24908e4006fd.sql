
-- Extend store_integrations with per-tenant api key + settings + traffic counters
ALTER TABLE public.store_integrations
  ADD COLUMN IF NOT EXISTS api_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS orders_imported_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_store_integrations_api_key ON public.store_integrations(api_key) WHERE api_key IS NOT NULL;

-- Extend webhook_deliveries to record response + integration key
ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS response jsonb,
  ADD COLUMN IF NOT EXISTS integration_key text;

-- Allow webhook_deliveries to have null store_id (for rejected/invalid-key requests we still want to log)
ALTER TABLE public.webhook_deliveries ALTER COLUMN store_id DROP NOT NULL;

-- Also let superadmins view rejected (store_id null) deliveries
DROP POLICY IF EXISTS "superadmins view all webhook_deliveries" ON public.webhook_deliveries;
CREATE POLICY "superadmins view all webhook_deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (is_superadmin(auth.uid()));

-- RPC: generate / rotate api key for a given store + integration (admin or superadmin)
CREATE OR REPLACE FUNCTION public.generate_integration_api_key(_store_id uuid, _integration_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_key text;
BEGIN
  IF NOT (public.is_store_admin(auth.uid(), _store_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  new_key := 'cmt_' || _integration_key || '_' || encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.store_integrations (store_id, integration_key, status, api_key)
  VALUES (_store_id, _integration_key, 'active', new_key)
  ON CONFLICT (store_id, integration_key)
  DO UPDATE SET api_key = new_key, status = COALESCE(NULLIF(store_integrations.status,'locked'),'active'), updated_at = now();

  RETURN new_key;
END $$;

-- Seed wpforms entry in integration_catalog (idempotent)
INSERT INTO public.integration_catalog (key, name, description, monthly_price, is_active)
VALUES ('wpforms', 'WPForms Webhook', 'Receive form submissions from WPForms (WordPress) and turn them into orders automatically.', 0, true)
ON CONFLICT (key) DO NOTHING;
