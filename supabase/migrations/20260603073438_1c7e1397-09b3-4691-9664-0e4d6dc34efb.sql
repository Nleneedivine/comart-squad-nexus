CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate the function so it explicitly resolves gen_random_bytes from the extensions schema,
-- regardless of search_path.
CREATE OR REPLACE FUNCTION public.generate_integration_api_key(_store_id uuid, _integration_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  new_key text;
  short_key text;
BEGIN
  IF NOT (public.is_store_admin(auth.uid(), _store_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  short_key := CASE WHEN _integration_key = 'wp_forms' THEN 'wp' ELSE _integration_key END;
  new_key := 'cmrt_' || short_key || '_' || encode(extensions.gen_random_bytes(20), 'hex');

  INSERT INTO public.store_integrations (store_id, integration_key, status, api_key)
  VALUES (_store_id, _integration_key, 'active', new_key)
  ON CONFLICT (store_id, integration_key)
  DO UPDATE SET api_key = new_key,
                status = COALESCE(NULLIF(store_integrations.status,'locked'),'active'),
                updated_at = now();

  RETURN new_key;
END $function$;