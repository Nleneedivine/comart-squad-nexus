
-- 1) Feature overrides
CREATE TABLE IF NOT EXISTS public.feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, feature_key)
);

GRANT SELECT ON public.feature_overrides TO authenticated;
GRANT ALL ON public.feature_overrides TO service_role;

ALTER TABLE public.feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view their overrides"
  ON public.feature_overrides FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));

CREATE POLICY "superadmins manage overrides"
  ON public.feature_overrides FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_feature_overrides_store ON public.feature_overrides(store_id);
CREATE INDEX IF NOT EXISTS idx_feature_overrides_expiry ON public.feature_overrides(expires_at) WHERE is_active = true;

CREATE TRIGGER trg_feature_overrides_updated_at
  BEFORE UPDATE ON public.feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Helper: is a feature currently overridden (free) for a store?
CREATE OR REPLACE FUNCTION public.has_active_feature_override(_store_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feature_overrides
    WHERE store_id = _store_id
      AND feature_key = _feature_key
      AND is_active = true
      AND start_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- 3) Update API-key generator to use cmrt_ prefix; wp_forms → cmrt_wp_
CREATE OR REPLACE FUNCTION public.generate_integration_api_key(_store_id uuid, _integration_key text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_key text;
  short_key text;
BEGIN
  IF NOT (public.is_store_admin(auth.uid(), _store_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  short_key := CASE WHEN _integration_key = 'wp_forms' THEN 'wp' ELSE _integration_key END;
  new_key := 'cmrt_' || short_key || '_' || encode(gen_random_bytes(20), 'hex');

  INSERT INTO public.store_integrations (store_id, integration_key, status, api_key)
  VALUES (_store_id, _integration_key, 'active', new_key)
  ON CONFLICT (store_id, integration_key)
  DO UPDATE SET api_key = new_key,
                status = COALESCE(NULLIF(store_integrations.status,'locked'),'active'),
                updated_at = now();

  RETURN new_key;
END $$;

-- 4) Expiry sweeper
CREATE OR REPLACE FUNCTION public.expire_feature_overrides()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.feature_overrides
  SET is_active = false, updated_at = now()
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at <= now();
$$;

-- 5) Schedule it (idempotent: unschedule then re-schedule)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-feature-overrides');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-feature-overrides',
  '*/15 * * * *',
  $$ SELECT public.expire_feature_overrides(); $$
);
