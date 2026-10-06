-- Align high-impact business-data mutations with the permission model.

INSERT INTO public.role_permissions(role, permission_key)
VALUES
  ('accountant', 'finance.view'),
  ('accountant', 'finance.manage'),
  ('accountant', 'inventory.view'),
  ('accountant', 'inventory.manage'),
  ('inventory_manager', 'inventory.view'),
  ('inventory_manager', 'inventory.manage'),
  ('logistics_manager', 'inventory.view'),
  ('logistics_manager', 'inventory.manage'),
  ('order_manager', 'orders.view'),
  ('order_manager', 'orders.manage')
ON CONFLICT DO NOTHING;

-- Finance records contain monetary business data. Members may no longer create
-- arbitrary finance entries merely by belonging to a store.
DROP POLICY IF EXISTS "members insert finance" ON public.finance_records;
DROP POLICY IF EXISTS "admins manage finance" ON public.finance_records;

CREATE POLICY "finance viewers can view finance"
  ON public.finance_records FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'finance.view'));

CREATE POLICY "finance managers can insert finance"
  ON public.finance_records FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'finance.manage'));

CREATE POLICY "finance managers can update finance"
  ON public.finance_records FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'finance.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'finance.manage'));

CREATE POLICY "finance managers can delete finance"
  ON public.finance_records FOR DELETE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'finance.manage'));

-- Product master data is controlled by inventory management.
DROP POLICY IF EXISTS "members insert products" ON public.products;
DROP POLICY IF EXISTS "members update products" ON public.products;
DROP POLICY IF EXISTS "admins manage products" ON public.products;

CREATE POLICY "inventory viewers can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));

CREATE POLICY "inventory managers can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

CREATE POLICY "inventory managers can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

CREATE POLICY "inventory managers can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

-- Call orders are order data; store membership alone is not enough to mutate it.
DROP POLICY IF EXISTS "Members can view store call orders" ON public.call_orders;
DROP POLICY IF EXISTS "Members can insert store call orders" ON public.call_orders;
DROP POLICY IF EXISTS "Members can update store call orders" ON public.call_orders;
DROP POLICY IF EXISTS "Admins or creator can delete call orders" ON public.call_orders;

CREATE POLICY "order viewers can view call orders"
  ON public.call_orders FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'orders.view'));

CREATE POLICY "order managers can insert call orders"
  ON public.call_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));

CREATE POLICY "order managers can update call orders"
  ON public.call_orders FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'orders.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));

CREATE POLICY "order managers can delete call orders"
  ON public.call_orders FOR DELETE
  TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'orders.manage'));
