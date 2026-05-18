
-- Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Store-level settings
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS max_call_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_assign_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_assign_strategy text NOT NULL DEFAULT 'least_load';

-- Call attempts
CREATE TABLE IF NOT EXISTS public.order_call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_number int NOT NULL,
  outcome text NOT NULL DEFAULT 'no_answer',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_attempts_order ON public.order_call_attempts(order_id);
ALTER TABLE public.order_call_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view call attempts" ON public.order_call_attempts;
CREATE POLICY "members view call attempts" ON public.order_call_attempts FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id));
DROP POLICY IF EXISTS "members insert call attempts" ON public.order_call_attempts;
CREATE POLICY "members insert call attempts" ON public.order_call_attempts FOR INSERT
  WITH CHECK (public.is_store_member(auth.uid(), store_id) AND user_id = auth.uid());
DROP POLICY IF EXISTS "admins manage call attempts" ON public.order_call_attempts;
CREATE POLICY "admins manage call attempts" ON public.order_call_attempts FOR ALL
  USING (public.is_store_admin(auth.uid(), store_id))
  WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- Auto-assign function
CREATE OR REPLACE FUNCTION public.auto_assign_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  s record;
  pick uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o IS NULL OR o.assigned_to IS NOT NULL THEN RETURN o.assigned_to; END IF;
  SELECT * INTO s FROM public.stores WHERE id = o.store_id;
  IF NOT COALESCE(s.auto_assign_enabled, true) THEN RETURN NULL; END IF;

  IF COALESCE(s.auto_assign_strategy,'least_load') = 'round_robin' THEN
    SELECT ur.user_id INTO pick
      FROM public.user_roles ur
      LEFT JOIN (
        SELECT assigned_to, MAX(assigned_at) AS last_at
        FROM public.orders WHERE store_id = o.store_id AND assigned_to IS NOT NULL
        GROUP BY assigned_to
      ) la ON la.assigned_to = ur.user_id
      WHERE ur.store_id = o.store_id
        AND COALESCE(ur.is_suspended,false) = false
        AND ur.role IN ('sales_rep','order_manager','customer_care','manager','admin','owner')
      GROUP BY ur.user_id, la.last_at
      ORDER BY la.last_at NULLS FIRST
      LIMIT 1;
  ELSE
    -- least load: pick staff with fewest open orders
    SELECT ur.user_id INTO pick
      FROM public.user_roles ur
      LEFT JOIN public.orders ord ON ord.assigned_to = ur.user_id
        AND ord.store_id = o.store_id
        AND ord.is_archived = false
        AND ord.status IN ('pending','processing','shipped')
      WHERE ur.store_id = o.store_id
        AND COALESCE(ur.is_suspended,false) = false
        AND ur.role IN ('sales_rep','order_manager','customer_care','manager','admin','owner')
      GROUP BY ur.user_id
      ORDER BY COUNT(ord.id) ASC
      LIMIT 1;
  END IF;

  IF pick IS NOT NULL THEN
    UPDATE public.orders SET assigned_to = pick, assigned_at = now() WHERE id = _order_id;
  END IF;
  RETURN pick;
END $$;

CREATE OR REPLACE FUNCTION public.tg_orders_auto_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    PERFORM public.auto_assign_order(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_auto_assign ON public.orders;
CREATE TRIGGER orders_auto_assign
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_auto_assign();

-- Super admin store deletion
CREATE OR REPLACE FUNCTION public.superadmin_delete_store(_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- user_roles ties to store
  DELETE FROM public.user_roles WHERE store_id = _store_id;
  DELETE FROM public.staff_invites WHERE store_id = _store_id;
  -- Audit
  INSERT INTO public.platform_audit_log(actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'store.delete', 'store', _store_id, jsonb_build_object('at', now()));
  -- Finally drop store (cascades to orders, products, customers, etc.)
  DELETE FROM public.stores WHERE id = _store_id;
END $$;

REVOKE ALL ON FUNCTION public.superadmin_delete_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_store(uuid) TO authenticated;
