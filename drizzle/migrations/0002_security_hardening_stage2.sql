DO $$
DECLARE fn text; def text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.generate_payslips(uuid)','public.mark_payroll_paid(uuid)'] LOOP
    def := pg_get_functiondef(fn::regprocedure);
    def := replace(def, 'public.is_store_admin(auth.uid(), pp.store_id)', 'public.has_permission(pp.store_id, ''payroll.manage'')');
    IF position('payroll.manage' in def) = 0 THEN RAISE EXCEPTION 'payroll auth replace failed for %', fn; END IF;
    EXECUTE def;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_store_webhook_secret(uuid) FROM authenticated, anon, PUBLIC;
REVOKE SELECT ON public.whatsapp_integrations FROM authenticated;
GRANT SELECT (id,store_id,phone_number_id,waba_id,display_phone_number,verified_name,status,last_error,last_tested_at,created_at,updated_at)
  ON public.whatsapp_integrations TO authenticated;

CREATE OR REPLACE FUNCTION public.rotate_store_webhook_secret(_store_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s text;
BEGIN
  IF NOT public.has_permission(_store_id, 'integrations.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  s := encode(extensions.gen_random_bytes(24), 'hex');
  PERFORM set_config('app.trusted_store_update', 'on', true);
  UPDATE public.stores SET webhook_secret = s WHERE id = _store_id;
  PERFORM set_config('app.trusted_store_update', 'off', true);
  INSERT INTO public.activity_log(store_id, user_id, type, activity) VALUES (_store_id, auth.uid(), 'integrations', 'webhook secret rotated');
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.store_webhook_configured(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_store_id,'integrations.manage')
    AND EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND webhook_secret IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.tg_stores_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_superadmin(auth.uid()) THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR (NEW.webhook_secret IS DISTINCT FROM OLD.webhook_secret AND COALESCE(current_setting('app.trusted_store_update', true),'') <> 'on') THEN
      RAISE EXCEPTION 'forbidden: protected store fields' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('email', i.email, 'role', i.role,
    'state', CASE WHEN i.status <> 'pending' OR i.accepted_at IS NOT NULL THEN 'used'
                  WHEN i.expires_at < now() THEN 'expired' ELSE 'pending' END,
    'store_name', s.name)
  FROM public.staff_invites i JOIN public.stores s ON s.id = i.store_id
  WHERE length(_token) >= 16 AND i.token = _token;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND roles = '{public}' LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.rotate_store_webhook_secret(uuid), public.store_webhook_configured(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_store_webhook_secret(uuid), public.store_webhook_configured(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_store_webhook_secret(uuid), public.store_webhook_configured(uuid) TO service_role;