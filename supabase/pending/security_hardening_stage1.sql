-- ===== Security hardening stage 1: permission model, tenant isolation, wallet, staff =====
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- Permission model ----------
CREATE OR REPLACE FUNCTION public.role_grants(_role public.app_role, _perm text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role::text
    WHEN 'owner' THEN true
    WHEN 'admin' THEN true
    WHEN 'manager' THEN _perm <> ALL (ARRAY['wallet.withdraw','wallet.manage','store.close'])
    WHEN 'head_of_operations' THEN _perm <> ALL (ARRAY['wallet.withdraw','wallet.manage','store.close'])
    WHEN 'hr' THEN _perm = ANY (ARRAY['staff.view','staff.manage','payroll.view','payroll.manage'])
    WHEN 'inventory_manager' THEN _perm = ANY (ARRAY['inventory.view','inventory.manage','inventory.receive','inventory.adjust','inventory.transfer','procurement.view','procurement.manage'])
    WHEN 'marketer' THEN _perm = ANY (ARRAY['sales_forms.view','sales_forms.manage','agents.view'])
    WHEN 'order_manager' THEN _perm = ANY (ARRAY['orders.view','orders.manage','customers.view','customers.manage','inventory.view','staff.view'])
    WHEN 'customer_care' THEN _perm = ANY (ARRAY['orders.view','customers.view','customers.manage'])
    WHEN 'logistics_manager' THEN _perm = ANY (ARRAY['inventory.view','inventory.transfer'])
    WHEN 'accountant' THEN _perm = ANY (ARRAY['finance.view','finance.manage','wallet.view','inventory.view','procurement.view','payroll.view'])
    ELSE false
  END;
$$;

-- Always evaluates the CURRENT user (auth.uid()); cannot be used to inspect others.
CREATE OR REPLACE FUNCTION public.has_permission(_store_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.status = 'active'
      AND (s.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.store_id = _store_id AND ur.user_id = auth.uid()
          AND COALESCE(ur.is_suspended,false) = false
          AND public.role_grants(ur.role, _perm)))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.store_id = _store_id AND ur.user_id = auth.uid()
               AND ur.role = 'owner' AND COALESCE(ur.is_suspended,false) = false));
$$;

-- ---------- Subject-guard legacy helpers (no probing other users) ----------
CREATE OR REPLACE FUNCTION public.is_store_admin(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role') AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.status = 'active'
      AND (s.owner_id = _user_id OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user_id AND ur.store_id = _store_id
          AND ur.role IN ('owner','admin','manager','head_of_operations')
          AND COALESCE(ur.is_suspended,false) = false)));
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role') AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.status = 'active'
      AND (s.owner_id = _user_id OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user_id AND ur.store_id = _store_id
          AND COALESCE(ur.is_suspended,false) = false)));
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _store_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role')
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND store_id=_store_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.is_member_active(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role') AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND store_id = _store_id AND COALESCE(is_suspended,false) = false)
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = _store_id AND owner_id = _user_id));
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role')
    AND EXISTS (SELECT 1 FROM public.chat_group_members WHERE user_id = _user_id AND group_id = _group_id);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR COALESCE(auth.role(),'') = 'service_role')
    AND EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = _user_id);
$$;

-- ---------- Active store ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_profiles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active_store_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.active_store_id IS DISTINCT FROM OLD.active_store_id)
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.stores s WHERE s.id = NEW.active_store_id AND s.status='active'
         AND (s.owner_id = NEW.id OR EXISTS (SELECT 1 FROM public.user_roles ur
              WHERE ur.store_id = s.id AND ur.user_id = NEW.id AND COALESCE(ur.is_suspended,false)=false)))
  THEN
    RAISE EXCEPTION 'forbidden: not a member of that store' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_guard ON public.profiles;
CREATE TRIGGER profiles_guard BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_guard();

CREATE OR REPLACE FUNCTION public.set_active_store(_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.is_store_member(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of that store' USING ERRCODE='42501';
  END IF;
  UPDATE public.profiles SET active_store_id = _store_id WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.my_stores()
RETURNS TABLE(store_id uuid, name text, roles text[], is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name,
    COALESCE(array_agg(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL), ARRAY['owner']),
    s.id = (SELECT p.active_store_id FROM public.profiles p WHERE p.id = auth.uid())
  FROM public.stores s
  LEFT JOIN public.user_roles ur ON ur.store_id = s.id AND ur.user_id = auth.uid() AND COALESCE(ur.is_suspended,false)=false
  WHERE s.status = 'active' AND auth.uid() IS NOT NULL
    AND (s.owner_id = auth.uid() OR ur.user_id IS NOT NULL)
  GROUP BY s.id, s.name;
$$;

-- ---------- Stores: protect privileged columns, hide webhook secret ----------
CREATE OR REPLACE FUNCTION public.tg_stores_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_superadmin(auth.uid()) THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.webhook_secret IS DISTINCT FROM OLD.webhook_secret THEN
      RAISE EXCEPTION 'forbidden: protected store fields' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stores_guard ON public.stores;
CREATE TRIGGER stores_guard BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.tg_stores_guard();

DROP POLICY IF EXISTS "owner updates store" ON public.stores;
CREATE POLICY "store managers update store" ON public.stores FOR UPDATE TO authenticated
  USING (public.has_permission(id, 'store.manage')) WITH CHECK (public.has_permission(id, 'store.manage'));
DROP POLICY IF EXISTS "owner inserts store" ON public.stores;
CREATE POLICY "owner inserts store" ON public.stores FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
REVOKE ALL ON public.stores FROM anon;
REVOKE SELECT ON public.stores FROM authenticated;
GRANT SELECT (id,name,owner_id,created_at,logo_url,description,contact_email,contact_phone,address,status,suspended_at,deleted_at,max_call_attempts,auto_assign_enabled,auto_assign_strategy,resumption_time,late_deadline)
  ON public.stores TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_webhook_secret(_store_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.webhook_secret FROM public.stores s
  WHERE s.id = _store_id AND public.has_permission(_store_id, 'integrations.manage');
$$;

-- ---------- Generic least-privilege RLS for business tables ----------
DO $$
DECLARE m record; r record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('customers','customers.view','customers.manage'),
    ('orders','orders.view','orders.manage'),
    ('order_items','orders.view','orders.manage'),
    ('order_status_history','orders.view','orders.manage'),
    ('order_call_attempts','orders.view','orders.manage'),
    ('call_orders','orders.view','orders.manage'),
    ('products','inventory.view','inventory.manage'),
    ('businesses','inventory.view','inventory.manage'),
    ('stock_movements','inventory.view','inventory.adjust'),
    ('faulty_stocks','inventory.view','inventory.adjust'),
    ('agent_stocks','inventory.view','inventory.transfer'),
    ('waybills','inventory.view','inventory.transfer'),
    ('suppliers','procurement.view','procurement.manage'),
    ('supplier_payments','procurement.view','procurement.manage'),
    ('purchases','procurement.view','procurement.manage'),
    ('purchase_items','procurement.view','procurement.manage'),
    ('purchase_orders','procurement.view','procurement.manage'),
    ('purchase_order_items','procurement.view','procurement.manage'),
    ('agents','agents.view','agents.manage'),
    ('finance_records','finance.view','finance.manage'),
    ('commissions','finance.view','finance.manage'),
    ('refunds','finance.view','finance.manage'),
    ('payroll_periods','payroll.view','payroll.manage'),
    ('payslips','payroll.view','payroll.manage'),
    ('staff_salaries','payroll.view','payroll.manage'),
    ('sales_forms','sales_forms.view','sales_forms.manage'),
    ('form_submissions','sales_forms.view','sales_forms.manage'),
    ('whatsapp_integrations','integrations.manage','integrations.manage'),
    ('whatsapp_use_cases','integrations.manage','integrations.manage'),
    ('whatsapp_templates','integrations.manage','integrations.manage'),
    ('whatsapp_message_logs','integrations.manage','integrations.manage'),
    ('store_integrations','integrations.manage','integrations.manage'),
    ('webhook_logs','integrations.manage','integrations.manage'),
    ('webhook_deliveries','integrations.manage','integrations.manage'),
    ('staff_invites','staff.manage','staff.manage'),
    ('wallets','wallet.view',NULL),
    ('wallet_transactions','wallet.view',NULL)
  ) AS v(t, vp, mp)
  LOOP
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename=m.t
               AND COALESCE(qual,'') || COALESCE(with_check,'') NOT LIKE '%is_superadmin%'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, m.t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', m.t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', m.t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', m.t);
    EXECUTE format('CREATE POLICY perm_select ON public.%I FOR SELECT TO authenticated USING (public.has_permission(store_id, %L))', m.t, m.vp);
    IF m.mp IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', m.t);
      EXECUTE format('CREATE POLICY perm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(store_id, %L))', m.t, m.mp);
      EXECUTE format('CREATE POLICY perm_update ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(store_id, %L)) WITH CHECK (public.has_permission(store_id, %L))', m.t, m.mp, m.mp);
      EXECUTE format('CREATE POLICY perm_delete ON public.%I FOR DELETE TO authenticated USING (public.has_permission(store_id, %L))', m.t, m.mp);
    ELSE
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', m.t);
    END IF;
  END LOOP;
END $$;

-- Assigned-work access for call/sales reps (their own orders only)
CREATE POLICY assigned_select ON public.orders FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY assigned_update ON public.orders FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() AND public.is_store_member(auth.uid(), store_id))
  WITH CHECK (assigned_to = auth.uid() AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY assigned_select ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.store_id = order_items.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY assigned_select ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND o.store_id = order_status_history.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY assigned_insert ON public.order_status_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND o.store_id = order_status_history.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY assigned_select ON public.order_call_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_call_attempts.order_id AND o.store_id = order_call_attempts.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY assigned_insert ON public.order_call_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_call_attempts.order_id AND o.store_id = order_call_attempts.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY assigned_select ON public.customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_id = customers.id AND o.store_id = customers.store_id AND o.assigned_to = auth.uid()));
CREATE POLICY own_select ON public.call_orders FOR SELECT TO authenticated
  USING ((created_by = auth.uid() OR agent_user_id = auth.uid()) AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY own_insert ON public.call_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY own_update ON public.call_orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.is_store_member(auth.uid(), store_id))
  WITH CHECK (created_by = auth.uid() AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY own_delete ON public.call_orders FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND public.is_store_member(auth.uid(), store_id));

-- WhatsApp: access token never readable by clients; only status is client-updatable
REVOKE SELECT, INSERT, UPDATE ON public.whatsapp_integrations FROM authenticated;
GRANT SELECT (id,store_id,phone_number_id,waba_id,display_phone_number,verified_name,webhook_verify_token,status,last_error,last_tested_at,created_at,updated_at)
  ON public.whatsapp_integrations TO authenticated;
GRANT UPDATE (status) ON public.whatsapp_integrations TO authenticated;

-- Integration API keys never readable by clients (shown only once on generation)
REVOKE SELECT, INSERT, UPDATE ON public.store_integrations FROM authenticated;
GRANT SELECT (id,store_id,integration_key,status,paystack_reference,activated_at,expires_at,created_at,updated_at,settings,last_webhook_at,orders_imported_count)
  ON public.store_integrations TO authenticated;
GRANT INSERT (store_id,integration_key,status,settings), UPDATE (status,settings) ON public.store_integrations TO authenticated;
CREATE OR REPLACE FUNCTION public.has_integration_api_key(_store_id uuid, _integration_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.store_integrations
    WHERE store_id=_store_id AND integration_key=_integration_key AND api_key IS NOT NULL)
    AND public.has_permission(_store_id,'integrations.manage');
$$;

CREATE OR REPLACE FUNCTION public.generate_integration_api_key(_store_id uuid, _integration_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE new_key text; short_key text;
BEGIN
  IF NOT (public.has_permission(_store_id, 'integrations.manage') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  short_key := CASE WHEN _integration_key = 'wp_forms' THEN 'wp' ELSE _integration_key END;
  new_key := 'cmrt_' || short_key || '_' || encode(extensions.gen_random_bytes(20), 'hex');
  INSERT INTO public.store_integrations (store_id, integration_key, status, api_key)
  VALUES (_store_id, _integration_key, 'active', new_key)
  ON CONFLICT (store_id, integration_key)
  DO UPDATE SET api_key = new_key,
                status = COALESCE(NULLIF(public.store_integrations.status,'locked'),'active'),
                updated_at = now();
  RETURN new_key;
END $$;

-- ---------- Staff: roles only via RPC ----------
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM authenticated, anon;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;

CREATE OR REPLACE FUNCTION public._role_rank(_role public.app_role)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role::text WHEN 'owner' THEN 3 WHEN 'admin' THEN 2
    WHEN 'manager' THEN 1 WHEN 'head_of_operations' THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public._caller_rank(_store_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    CASE WHEN EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND owner_id=auth.uid()) THEN 3 ELSE 0 END,
    COALESCE((SELECT max(public._role_rank(role)) FROM public.user_roles
              WHERE store_id=_store_id AND user_id=auth.uid() AND COALESCE(is_suspended,false)=false), 0));
$$;

CREATE OR REPLACE FUNCTION public._target_rank(_store_id uuid, _user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    CASE WHEN EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND owner_id=_user_id) THEN 3 ELSE 0 END,
    COALESCE((SELECT max(public._role_rank(role)) FROM public.user_roles WHERE store_id=_store_id AND user_id=_user_id), 0));
$$;

CREATE OR REPLACE FUNCTION public._assert_can_manage_member(_store_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_store_id, 'staff.manage') THEN
    RAISE EXCEPTION 'forbidden: staff.manage required' USING ERRCODE='42501';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot change your own access' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND owner_id=_user_id) THEN
    RAISE EXCEPTION 'forbidden: the store owner cannot be changed' USING ERRCODE='42501';
  END IF;
  IF public._target_rank(_store_id,_user_id) >= public._caller_rank(_store_id) AND public._caller_rank(_store_id) < 3 THEN
    RAISE EXCEPTION 'forbidden: target has equal or higher access' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE store_id=_store_id AND user_id=_user_id) THEN
    RAISE EXCEPTION 'not a member of this store';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_suspended(_store_id uuid, _user_id uuid, _suspended boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_can_manage_member(_store_id, _user_id);
  UPDATE public.user_roles SET is_suspended = _suspended WHERE store_id=_store_id AND user_id=_user_id;
  INSERT INTO public.activity_log(store_id, user_id, type, activity)
  VALUES (_store_id, auth.uid(), 'staff', CASE WHEN _suspended THEN 'suspended ' ELSE 'reactivated ' END || _user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.staff_assign_role(_store_id uuid, _user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_can_manage_member(_store_id, _user_id);
  IF _role = 'owner' THEN RAISE EXCEPTION 'forbidden: owner role cannot be assigned' USING ERRCODE='42501'; END IF;
  IF public._role_rank(_role) >= public._caller_rank(_store_id) AND public._caller_rank(_store_id) < 3 THEN
    RAISE EXCEPTION 'forbidden: cannot grant a role at or above your own' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.user_roles(user_id, store_id, role) VALUES (_user_id, _store_id, _role) ON CONFLICT DO NOTHING;
  INSERT INTO public.activity_log(store_id, user_id, type, activity)
  VALUES (_store_id, auth.uid(), 'staff', 'granted ' || _role::text || ' to ' || _user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.staff_remove_role(_store_id uuid, _user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_can_manage_member(_store_id, _user_id);
  IF _role = 'owner' AND (SELECT count(*) FROM public.user_roles WHERE store_id=_store_id AND role='owner') <= 1 THEN
    RAISE EXCEPTION 'cannot remove the last owner';
  END IF;
  DELETE FROM public.user_roles WHERE store_id=_store_id AND user_id=_user_id AND role=_role;
  INSERT INTO public.activity_log(store_id, user_id, type, activity)
  VALUES (_store_id, auth.uid(), 'staff', 'removed ' || _role::text || ' from ' || _user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.staff_remove_member(_store_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_can_manage_member(_store_id, _user_id);
  DELETE FROM public.user_roles WHERE store_id=_store_id AND user_id=_user_id;
  UPDATE public.profiles SET active_store_id = NULL WHERE id=_user_id AND active_store_id=_store_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_set_assignment_weight(_role_id uuid, _weight int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  SELECT store_id INTO sid FROM public.user_roles WHERE id=_role_id;
  IF sid IS NULL OR NOT public.has_permission(sid,'staff.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.user_roles SET assignment_weight = GREATEST(0, LEAST(_weight, 1000)) WHERE id=_role_id;
END $$;

-- Invites: role ceiling + token lookup without listing table
CREATE OR REPLACE FUNCTION public.tg_staff_invites_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(),'') <> 'service_role' THEN
    IF NEW.role = 'owner' THEN RAISE EXCEPTION 'forbidden: cannot invite an owner' USING ERRCODE='42501'; END IF;
    IF public._role_rank(NEW.role) >= public._caller_rank(NEW.store_id) AND public._caller_rank(NEW.store_id) < 3 THEN
      RAISE EXCEPTION 'forbidden: cannot invite at or above your own role' USING ERRCODE='42501';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.invited_by := auth.uid(); NEW.email := lower(btrim(NEW.email)); END IF;
    IF TG_OP = 'UPDATE' AND (NEW.token IS DISTINCT FROM OLD.token OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by OR (NEW.status = 'accepted' AND OLD.status <> 'accepted')) THEN
      RAISE EXCEPTION 'forbidden: protected invite fields' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staff_invites_guard ON public.staff_invites;
CREATE TRIGGER staff_invites_guard BEFORE INSERT OR UPDATE ON public.staff_invites
  FOR EACH ROW EXECUTE FUNCTION public.tg_staff_invites_guard();

CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'status', i.status,
    'expires_at', i.expires_at, 'accepted_at', i.accepted_at, 'store_id', i.store_id, 'store_name', s.name)
  FROM public.staff_invites i JOIN public.stores s ON s.id = i.store_id
  WHERE length(_token) >= 16 AND i.token = _token;
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; u_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT email INTO u_email FROM auth.users WHERE id = auth.uid();
  IF u_email IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT * INTO inv FROM public.staff_invites WHERE token = _token FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.status <> 'pending' OR inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite already used or revoked'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;
  IF lower(inv.email) <> lower(u_email) THEN RAISE EXCEPTION 'invite email mismatch' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = inv.store_id AND status='active') THEN
    RAISE EXCEPTION 'store is not active';
  END IF;
  INSERT INTO public.user_roles (user_id, store_id, role) VALUES (auth.uid(), inv.store_id, inv.role) ON CONFLICT DO NOTHING;
  UPDATE public.staff_invites SET status='accepted', accepted_by=auth.uid(), accepted_at=now() WHERE id = inv.id;
  INSERT INTO public.activity_log(store_id, user_id, type, activity)
  VALUES (inv.store_id, auth.uid(), 'staff', u_email || ' joined as ' || inv.role::text);
  UPDATE public.profiles SET onboarding_completed = true, onboarding_step = 4, active_store_id = inv.store_id WHERE id = auth.uid();
  RETURN jsonb_build_object('store_id', inv.store_id, 'role', inv.role);
END $$;

-- New users: no email backdoor; invited users never get a personal store
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_store_id uuid; inv record;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO inv FROM public.staff_invites
   WHERE lower(email) = lower(NEW.email) AND status = 'pending' AND expires_at > now()
     AND (NEW.raw_user_meta_data->>'invite_token' IS NULL OR token = NEW.raw_user_meta_data->>'invite_token')
   ORDER BY created_at DESC LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, store_id, role) VALUES (NEW.id, inv.store_id, inv.role) ON CONFLICT DO NOTHING;
    UPDATE public.staff_invites SET status='accepted', accepted_by=NEW.id, accepted_at=now() WHERE id = inv.id;
    UPDATE public.profiles SET active_store_id = inv.store_id, onboarding_completed = true, onboarding_step = 4 WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Came through an invite link (or has any outstanding invite): never auto-create a store
  IF NEW.raw_user_meta_data ? 'invite_token'
     OR EXISTS (SELECT 1 FROM public.staff_invites WHERE lower(email) = lower(NEW.email) AND status = 'pending') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stores (name, owner_id)
  VALUES (COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'store_name'),''), 'My Store'), NEW.id)
  RETURNING id INTO new_store_id;
  INSERT INTO public.user_roles (user_id, store_id, role) VALUES (NEW.id, new_store_id, 'owner');
  UPDATE public.profiles SET active_store_id = new_store_id WHERE id = NEW.id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.get_store_members_detail(_store_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, phone text, roles text[], role_ids uuid[], is_suspended boolean, joined_at timestamptz, last_sign_in_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(_store_id,'staff.view') OR public.has_permission(_store_id,'orders.manage') OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, p.full_name, p.email, p.phone,
    array_agg(ur.role::text ORDER BY ur.role::text), array_agg(ur.id),
    bool_or(ur.is_suspended), min(ur.created_at), u.last_sign_in_at,
    CASE WHEN bool_or(ur.is_suspended) THEN 'Inactive' WHEN u.last_sign_in_at IS NULL THEN 'Pending' ELSE 'Active' END
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.store_id = _store_id
  GROUP BY ur.user_id, p.full_name, p.email, p.phone, u.last_sign_in_at;
END $$;

-- Procurement receiving requires inventory.receive
CREATE OR REPLACE FUNCTION public.receive_purchase_order_items(_po_id uuid, _items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; poi_row record; po_row record; new_stock int; recv int; dmg int;
  total_ordered int; total_received int; new_status text;
BEGIN
  SELECT * INTO po_row FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po_row IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF NOT public.has_permission(po_row.store_id, 'inventory.receive') THEN
    RAISE EXCEPTION 'forbidden: inventory.receive required' USING ERRCODE='42501';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    recv := GREATEST(COALESCE((item->>'received')::int, 0), 0);
    dmg := GREATEST(COALESCE((item->>'damaged')::int, 0), 0);
    SELECT * INTO poi_row FROM public.purchase_order_items
      WHERE id = (item->>'id')::uuid AND purchase_order_id = _po_id AND store_id = po_row.store_id FOR UPDATE;
    IF poi_row IS NULL THEN CONTINUE; END IF;
    IF poi_row.received_qty + poi_row.damaged_qty + recv + dmg > poi_row.quantity THEN
      RAISE EXCEPTION 'cannot receive more than ordered for %', poi_row.product_name;
    END IF;
    UPDATE public.purchase_order_items SET received_qty = received_qty + recv, damaged_qty = damaged_qty + dmg WHERE id = poi_row.id;
    IF poi_row.product_id IS NOT NULL AND recv > 0 THEN
      UPDATE public.products SET stock_qty = COALESCE(stock_qty,0) + recv
        WHERE id = poi_row.product_id AND store_id = po_row.store_id RETURNING stock_qty INTO new_stock;
      IF new_stock IS NOT NULL THEN
        INSERT INTO public.stock_movements(store_id, product_id, product_name, type, qty_change, balance, reference)
        VALUES (po_row.store_id, poi_row.product_id, poi_row.product_name, 'in', recv, new_stock, 'PO ' || po_row.po_number);
      END IF;
    END IF;
  END LOOP;
  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(received_qty + damaged_qty),0) INTO total_ordered, total_received
    FROM public.purchase_order_items WHERE purchase_order_id = _po_id;
  IF total_received >= total_ordered AND total_ordered > 0 THEN new_status := 'received';
  ELSIF total_received > 0 THEN new_status := 'partially_received';
  ELSE new_status := po_row.status; END IF;
  UPDATE public.purchase_orders SET status = new_status,
    received_at = CASE WHEN new_status = 'received' THEN now() ELSE received_at END WHERE id = _po_id;
END $$;

-- ---------- Wallet ----------
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS pin_failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS has_pin boolean GENERATED ALWAYS AS (pin_hash IS NOT NULL) STORED;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_reference_uniq ON public.wallet_transactions(reference) WHERE reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_idem_uniq ON public.wallet_transactions(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

REVOKE SELECT ON public.wallets FROM authenticated;
GRANT SELECT (id,store_id,balance,bank_name,bank_account_number,bank_account_name,has_pin,pin_locked_until,created_at,updated_at)
  ON public.wallets TO authenticated;

CREATE OR REPLACE FUNCTION public._wallet_for_update(_store_id uuid)
RETURNS public.wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets;
BEGIN
  INSERT INTO public.wallets(store_id) VALUES (_store_id) ON CONFLICT (store_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE store_id = _store_id FOR UPDATE;
  RETURN w;
END $$;

-- Returns 'ok' | 'invalid' | 'locked' | 'no_pin'; failure counter is committed (no exception)
CREATE OR REPLACE FUNCTION public._wallet_check_pin(_wallet_id uuid, _pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE w public.wallets; ok boolean;
BEGIN
  SELECT * INTO w FROM public.wallets WHERE id = _wallet_id FOR UPDATE;
  IF w.pin_hash IS NULL THEN RETURN 'no_pin'; END IF;
  IF w.pin_locked_until IS NOT NULL AND w.pin_locked_until > now() THEN RETURN 'locked'; END IF;
  IF _pin IS NULL OR _pin !~ '^\d{4,6}$' THEN ok := false;
  ELSIF w.pin_hash LIKE '$2%' THEN ok := extensions.crypt(_pin, w.pin_hash) = w.pin_hash;
  ELSE ok := encode(extensions.digest(_pin, 'sha256'), 'hex') = w.pin_hash; -- legacy, upgraded below
  END IF;
  IF ok THEN
    UPDATE public.wallets SET pin_failed_attempts = 0, pin_locked_until = NULL,
      pin_hash = CASE WHEN pin_hash LIKE '$2%' THEN pin_hash ELSE extensions.crypt(_pin, extensions.gen_salt('bf', 10)) END
      WHERE id = _wallet_id;
    RETURN 'ok';
  END IF;
  UPDATE public.wallets SET pin_failed_attempts = pin_failed_attempts + 1,
    pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
    updated_at = now() WHERE id = _wallet_id;
  RETURN 'invalid';
END $$;

CREATE OR REPLACE FUNCTION public.wallet_ensure(_store_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wid uuid;
BEGIN
  IF NOT public.has_permission(_store_id, 'wallet.view') THEN RAISE EXCEPTION 'forbidden: wallet.view required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.wallets(store_id) VALUES (_store_id) ON CONFLICT (store_id) DO NOTHING;
  SELECT id INTO wid FROM public.wallets WHERE store_id = _store_id;
  RETURN wid;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_set_pin(_store_id uuid, _new_pin text, _current_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE w public.wallets; chk text;
BEGIN
  IF NOT public.has_permission(_store_id, 'wallet.manage') THEN RAISE EXCEPTION 'forbidden: wallet.manage required' USING ERRCODE='42501'; END IF;
  IF _new_pin IS NULL OR _new_pin !~ '^\d{4,6}$' THEN RETURN jsonb_build_object('ok',false,'error','PIN must be 4-6 digits'); END IF;
  w := public._wallet_for_update(_store_id);
  IF w.pin_hash IS NOT NULL THEN
    chk := public._wallet_check_pin(w.id, _current_pin);
    IF chk <> 'ok' THEN RETURN jsonb_build_object('ok',false,'error', CASE chk WHEN 'locked' THEN 'PIN locked, try later' ELSE 'Current PIN is incorrect' END); END IF;
  END IF;
  UPDATE public.wallets SET pin_hash = extensions.crypt(_new_pin, extensions.gen_salt('bf', 10)),
    pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = w.id;
  INSERT INTO public.activity_log(store_id, user_id, type, activity) VALUES (_store_id, auth.uid(), 'wallet', 'wallet PIN changed');
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.wallet_update_bank(_store_id uuid, _bank_name text, _account_number text, _account_name text, _pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets; chk text;
BEGIN
  IF NOT public.has_permission(_store_id, 'wallet.manage') THEN RAISE EXCEPTION 'forbidden: wallet.manage required' USING ERRCODE='42501'; END IF;
  IF _account_number IS NULL OR _account_number !~ '^\d{10}$' THEN RETURN jsonb_build_object('ok',false,'error','Account number must be 10 digits'); END IF;
  IF length(btrim(COALESCE(_bank_name,''))) < 2 OR length(btrim(COALESCE(_account_name,''))) < 2
     OR length(_bank_name) > 100 OR length(_account_name) > 120 THEN
    RETURN jsonb_build_object('ok',false,'error','Bank name and account name are required');
  END IF;
  w := public._wallet_for_update(_store_id);
  IF w.pin_hash IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Set a wallet PIN first'); END IF;
  chk := public._wallet_check_pin(w.id, _pin);
  IF chk <> 'ok' THEN RETURN jsonb_build_object('ok',false,'error', CASE chk WHEN 'locked' THEN 'PIN locked, try later' ELSE 'Incorrect PIN' END); END IF;
  UPDATE public.wallets SET bank_name = btrim(_bank_name), bank_account_number = _account_number,
    bank_account_name = btrim(_account_name), updated_at = now() WHERE id = w.id;
  INSERT INTO public.activity_log(store_id, user_id, type, activity) VALUES (_store_id, auth.uid(), 'wallet', 'bank account changed');
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.wallet_create_funding(_store_id uuid, _amount numeric, _reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets; tx_id uuid;
BEGIN
  IF NOT public.has_permission(_store_id, 'wallet.fund') THEN RAISE EXCEPTION 'forbidden: wallet.fund required' USING ERRCODE='42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 10000000 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF _reference IS NULL OR _reference !~ '^fund_[a-z0-9_]{8,80}$' THEN RAISE EXCEPTION 'invalid reference'; END IF;
  w := public._wallet_for_update(_store_id);
  INSERT INTO public.wallet_transactions(store_id, wallet_id, kind, amount, status, reference, paystack_reference, created_by, description)
  VALUES (_store_id, w.id, 'funding', round(_amount, 2), 'pending', _reference, _reference, auth.uid(), 'Wallet funding (Paystack)')
  RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_request_withdrawal(_store_id uuid, _amount numeric, _pin text, _idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.wallets; chk text; existing record; ref text;
BEGIN
  IF NOT public.has_permission(_store_id, 'wallet.withdraw') THEN RAISE EXCEPTION 'forbidden: wallet.withdraw required' USING ERRCODE='42501'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 10000000 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  w := public._wallet_for_update(_store_id);   -- row lock serialises concurrent withdrawals
  SELECT * INTO existing FROM public.wallet_transactions WHERE store_id=_store_id AND idempotency_key=_idempotency_key;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reference', existing.reference, 'duplicate', true);
  END IF;
  IF w.bank_account_number IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Add bank account first'); END IF;
  chk := public._wallet_check_pin(w.id, _pin);
  IF chk <> 'ok' THEN RETURN jsonb_build_object('ok',false,'error', CASE chk WHEN 'locked' THEN 'PIN locked, try later' WHEN 'no_pin' THEN 'Set a wallet PIN first' ELSE 'Incorrect PIN' END); END IF;
  IF w.balance < _amount THEN RETURN jsonb_build_object('ok',false,'error','Insufficient balance'); END IF;
  ref := 'wd_' || replace(gen_random_uuid()::text, '-', '');
  UPDATE public.wallets SET balance = balance - round(_amount,2), updated_at = now() WHERE id = w.id;
  INSERT INTO public.wallet_transactions(store_id, wallet_id, kind, amount, status, reference, created_by, description, idempotency_key)
  VALUES (_store_id, w.id, 'withdrawal', round(_amount,2), 'pending', ref, auth.uid(),
          'Withdraw to ' || COALESCE(w.bank_name,'') || ' ' || w.bank_account_number, _idempotency_key);
  INSERT INTO public.activity_log(store_id, user_id, type, activity) VALUES (_store_id, auth.uid(), 'wallet', 'withdrawal requested ' || ref);
  RETURN jsonb_build_object('ok', true, 'reference', ref);
END $$;

-- Trusted server path only (service_role). Idempotent: settles a pending tx exactly once.
CREATE OR REPLACE FUNCTION public.wallet_settle_transaction(_reference text, _success boolean, _paid_amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx public.wallet_transactions;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO tx FROM public.wallet_transactions WHERE reference = _reference FOR UPDATE;
  IF tx.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF tx.status <> 'pending' THEN RETURN jsonb_build_object('ok', tx.status = 'success', 'already', true, 'status', tx.status); END IF;
  PERFORM 1 FROM public.wallets WHERE id = tx.wallet_id FOR UPDATE;
  IF tx.kind = 'funding' THEN
    IF _success AND _paid_amount IS NOT NULL AND round(_paid_amount,2) <> round(tx.amount,2) THEN
      UPDATE public.wallet_transactions SET status='failed', description = description || ' (amount mismatch)' WHERE id = tx.id;
      RETURN jsonb_build_object('ok',false,'error','amount_mismatch');
    END IF;
    UPDATE public.wallet_transactions SET status = CASE WHEN _success THEN 'success'::public.wallet_tx_status ELSE 'failed'::public.wallet_tx_status END WHERE id = tx.id;
    IF _success THEN UPDATE public.wallets SET balance = balance + tx.amount, updated_at = now() WHERE id = tx.wallet_id; END IF;
  ELSIF tx.kind = 'withdrawal' THEN
    UPDATE public.wallet_transactions SET status = CASE WHEN _success THEN 'success'::public.wallet_tx_status ELSE 'failed'::public.wallet_tx_status END WHERE id = tx.id;
    IF NOT _success THEN UPDATE public.wallets SET balance = balance + tx.amount, updated_at = now() WHERE id = tx.wallet_id; END IF;
  ELSE
    UPDATE public.wallet_transactions SET status = CASE WHEN _success THEN 'success'::public.wallet_tx_status ELSE 'failed'::public.wallet_tx_status END WHERE id = tx.id;
  END IF;
  RETURN jsonb_build_object('ok', _success, 'store_id', tx.store_id);
END $$;

-- ---------- Public sales form (the only anonymous surface) ----------
CREATE OR REPLACE FUNCTION public.get_public_sales_form(_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'form', jsonb_build_object('id', f.id, 'store_id', f.store_id, 'title', f.title, 'slug', f.slug,
                               'description', f.description, 'fields', f.fields, 'product_ids', f.product_ids),
    'store', jsonb_build_object('name', s.name, 'logo_url', s.logo_url, 'contact_phone', s.contact_phone),
    'products', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'selling_price', p.selling_price, 'stock_qty', p.stock_qty))
                 FROM public.products p WHERE p.store_id = f.store_id AND p.id = ANY (f.product_ids)), '[]'::jsonb))
  FROM public.sales_forms f JOIN public.stores s ON s.id = f.store_id AND s.status = 'active'
  WHERE f.status = 'active' AND (f.slug = _key OR f.id::text = _key)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_sales_form(_form_id uuid, _info jsonb, _items jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f record; it jsonb; p record; q int; total numeric := 0; units int := 0; lines jsonb := '[]'::jsonb;
  cname text; cphone text; cemail text; caddr text; cust_id uuid; ord_id uuid; onum text;
BEGIN
  SELECT sf.* INTO f FROM public.sales_forms sf JOIN public.stores s ON s.id = sf.store_id AND s.status='active'
    WHERE sf.id = _form_id AND sf.status = 'active';
  IF f.id IS NULL THEN RAISE EXCEPTION 'form not available'; END IF;
  cname := left(btrim(COALESCE(_info->>'customer_name','')), 120);
  cphone := left(regexp_replace(COALESCE(_info->>'customer_phone',''), '[^0-9+]', '', 'g'), 20);
  cemail := NULLIF(left(btrim(COALESCE(_info->>'customer_email','')), 200), '');
  caddr := NULLIF(left(concat_ws(', ', NULLIF(btrim(_info->>'customer_address'),''), NULLIF(btrim(_info->>'city'),''), NULLIF(btrim(_info->>'state'),'')), 500), '');
  IF length(cname) < 2 OR length(cphone) < 7 THEN RAISE EXCEPTION 'name and phone are required'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'invalid items'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := COALESCE((it->>'quantity')::int, 0);
    IF q < 1 OR q > 1000 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    SELECT id, name, selling_price INTO p FROM public.products
      WHERE id = (it->>'product_id')::uuid AND store_id = f.store_id AND id = ANY (f.product_ids);
    IF p.id IS NULL THEN RAISE EXCEPTION 'invalid product'; END IF;
    total := total + p.selling_price * q; units := units + q;
    lines := lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'unit_price', p.selling_price, 'quantity', q, 'subtotal', p.selling_price * q);
  END LOOP;

  INSERT INTO public.form_submissions(store_id, form_id, customer_name, customer_phone, customer_email, customer_address, notes, items, total)
  VALUES (f.store_id, f.id, cname, cphone, cemail, caddr, NULLIF(left(_info->>'notes', 1000),''), lines, total);

  SELECT id INTO cust_id FROM public.customers WHERE store_id = f.store_id AND phone = cphone LIMIT 1;
  IF cust_id IS NULL THEN
    INSERT INTO public.customers(store_id, name, phone, email, address, state, city)
    VALUES (f.store_id, cname, cphone, cemail, caddr, NULLIF(left(_info->>'state',80),''), NULLIF(left(_info->>'city',80),''))
    RETURNING id INTO cust_id;
  END IF;
  onum := 'ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 10));
  INSERT INTO public.orders(store_id, customer_id, customer_name, amount, units, status, order_number, notes)
  VALUES (f.store_id, cust_id, cname, total, units, 'pending', onum, 'From form: ' || f.title)
  RETURNING id INTO ord_id;
  INSERT INTO public.order_items(order_id, store_id, product_id, product_name, quantity, unit_price, subtotal)
  SELECT ord_id, f.store_id, (l->>'product_id')::uuid, l->>'name', (l->>'quantity')::int, (l->>'unit_price')::numeric, (l->>'subtotal')::numeric
  FROM jsonb_array_elements(lines) l;
  RETURN onum;
END $$;

-- ---------- EXECUTE privileges ----------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Helpers used inside RLS policies
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text), public.role_grants(public.app_role, text),
  public.is_store_owner(uuid), public.is_store_admin(uuid, uuid), public.is_store_member(uuid, uuid),
  public.is_superadmin(uuid), public.has_role(uuid, uuid, public.app_role), public.is_group_member(uuid, uuid),
  public.is_member_active(uuid, uuid), public.has_active_feature_override(uuid, text)
  TO authenticated;
-- Client-facing RPCs
GRANT EXECUTE ON FUNCTION public.set_active_store(uuid), public.my_stores(),
  public.accept_staff_invite(text), public.close_my_store(uuid), public.generate_integration_api_key(uuid, text),
  public.has_integration_api_key(uuid, text),
  public.generate_payslips(uuid), public.mark_payroll_paid(uuid), public.get_store_members_detail(uuid),
  public.get_store_webhook_secret(uuid), public.mark_admin_message_read(uuid), public.receive_purchase_order_items(uuid, jsonb),
  public.superadmin_delete_store(uuid), public.superadmin_list_tenants(), public.isolation_probe(uuid, uuid),
  public.staff_set_suspended(uuid, uuid, boolean), public.staff_assign_role(uuid, uuid, public.app_role),
  public.staff_remove_role(uuid, uuid, public.app_role), public.staff_remove_member(uuid, uuid),
  public.staff_set_assignment_weight(uuid, int),
  public.wallet_ensure(uuid), public.wallet_set_pin(uuid, text, text), public.wallet_update_bank(uuid, text, text, text, text),
  public.wallet_create_funding(uuid, numeric, text), public.wallet_request_withdrawal(uuid, numeric, text, text)
  TO authenticated;
-- Intentionally public
GRANT EXECUTE ON FUNCTION public.get_public_sales_form(text), public.submit_sales_form(uuid, jsonb, jsonb),
  public.get_invite_by_token(text) TO anon, authenticated;
-- wallet_settle_transaction: service_role only (granted above via ALL FUNCTIONS)
