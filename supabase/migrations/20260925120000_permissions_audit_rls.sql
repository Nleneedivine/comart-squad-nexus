-- Permission model + audit trail foundation.
CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read permissions" ON public.permissions;
CREATE POLICY "authenticated read permissions"
ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read role permissions" ON public.role_permissions;
CREATE POLICY "authenticated read role permissions"
ON public.role_permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.permissions(key, description) VALUES
 ('staff.view','View staff'),
 ('staff.manage','Manage staff and roles'),
 ('orders.view','View orders'),
 ('orders.manage','Create and manage orders'),
 ('inventory.view','View inventory'),
 ('inventory.manage','Manage inventory'),
 ('finance.view','View finance'),
 ('finance.manage','Manage finance'),
 ('wallet.view','View wallet'),
 ('wallet.fund','Fund wallet'),
 ('wallet.withdraw','Request wallet withdrawals'),
 ('wallet.manage','Manage wallet settings'),
 ('reports.view','View reports'),
 ('integrations.manage','Manage integrations')
ON CONFLICT (key) DO NOTHING;

-- Conservative initial mapping. Existing privileged store admins retain their
-- existing capabilities; this table is the foundation for granular checks.
INSERT INTO public.role_permissions(role, permission_key)
SELECT r.role, p.key
FROM (VALUES
  ('owner'::public.app_role), ('admin'::public.app_role),
  ('manager'::public.app_role), ('head_of_operations'::public.app_role)
) r(role)
CROSS JOIN public.permissions p
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _store_id UUID,
  _permission TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND ur.store_id = _store_id
      AND rp.permission_key = _permission
  )
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.owner_id = _user_id
  );
$$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created
  ON public.audit_logs(store_id, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store admins view audit logs" ON public.audit_logs;
CREATE POLICY "store admins view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_store_admin(auth.uid(), store_id));

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _store_id UUID,
  _action TEXT,
  _entity_type TEXT,
  _entity_id UUID,
  _before JSONB,
  _after JSONB,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs
    (store_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES
    (_store_id, auth.uid(), _action, _entity_type, _entity_id, _before, _after, COALESCE(_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_user_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(NEW.store_id, 'ROLE_ASSIGNED', 'user_role', NEW.id, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.write_audit_log(NEW.store_id, 'ROLE_CHANGED', 'user_role', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    PERFORM public.write_audit_log(OLD.store_id, 'ROLE_REMOVED', 'user_role', OLD.id, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles_change ON public.user_roles;
CREATE TRIGGER audit_user_roles_change
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_change();

CREATE OR REPLACE FUNCTION public.audit_orders_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log(NEW.store_id, 'ORDER_CREATED', 'order', NEW.id, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.write_audit_log(NEW.store_id, 'ORDER_UPDATED', 'order', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    PERFORM public.write_audit_log(OLD.store_id, 'ORDER_DELETED', 'order', OLD.id, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_orders_change ON public.orders;
CREATE TRIGGER audit_orders_change
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_orders_change();

-- Tighten wallet column mutation privileges. PIN and balance are server-controlled.
REVOKE UPDATE (pin_hash, balance) ON public.wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM authenticated;

DROP POLICY IF EXISTS "members insert wallet_tx" ON public.wallet_transactions;
DROP POLICY IF EXISTS "admins manage wallet_tx" ON public.wallet_transactions;

-- Existing transaction history remains readable by store members.
-- New financial mutations must go through audited server-side RPCs.
