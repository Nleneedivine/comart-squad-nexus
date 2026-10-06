-- Core business-data authorization hardening.
-- Replace broad store-membership write access with permission-based RLS.

INSERT INTO public.permissions(key, description) VALUES
 ('customers.view','View customers'),
 ('customers.manage','Create and manage customers'),
 ('agents.view','View sales agents'),
 ('agents.manage','Manage sales agents'),
 ('logistics.manage','Manage waybills and logistics stock')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key)
SELECT r.role, p.key
FROM (
  VALUES
    ('owner'::public.app_role), ('admin'::public.app_role),
    ('manager'::public.app_role), ('head_of_operations'::public.app_role)
) r(role)
CROSS JOIN public.permissions p
WHERE p.key IN ('customers.view','customers.manage','agents.view','agents.manage','logistics.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key)
SELECT r.role, p.key
FROM (
  VALUES
    ('customer_care'::public.app_role), ('order_manager'::public.app_role)
) r(role)
CROSS JOIN public.permissions p
WHERE p.key IN ('customers.view','customers.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('marketer'::public.app_role)) r(role)
CROSS JOIN public.permissions p
WHERE p.key IN ('agents.view','agents.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key)
SELECT r.role, p.key
FROM (
  VALUES
    ('inventory_manager'::public.app_role),
    ('order_manager'::public.app_role),
    ('logistics_manager'::public.app_role)
) r(role)
CROSS JOIN public.permissions p
WHERE p.key = 'logistics.manage'
ON CONFLICT DO NOTHING;

-- Customers
DROP POLICY IF EXISTS "members view customers" ON public.customers;
DROP POLICY IF EXISTS "members insert customers" ON public.customers;
DROP POLICY IF EXISTS "members update customers" ON public.customers;
DROP POLICY IF EXISTS "admins manage customers" ON public.customers;
CREATE POLICY "customers view by permission" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'customers.view'));
CREATE POLICY "customers insert by permission" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'customers.manage'));
CREATE POLICY "customers update by permission" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'customers.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'customers.manage'));
CREATE POLICY "customers delete by permission" ON public.customers
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), store_id, 'customers.manage'));

-- Order children and purchase records inherit the parent module permission.
DROP POLICY IF EXISTS "members view order_items" ON public.order_items;
DROP POLICY IF EXISTS "members insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "admins manage order_items" ON public.order_items;
CREATE POLICY "order items view by permission" ON public.order_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.view'));
CREATE POLICY "order items insert by permission" ON public.order_items
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));
CREATE POLICY "order items update by permission" ON public.order_items
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));
CREATE POLICY "order items delete by permission" ON public.order_items
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.manage'));

DROP POLICY IF EXISTS "members view order_history" ON public.order_status_history;
DROP POLICY IF EXISTS "members insert order_history" ON public.order_status_history;
CREATE POLICY "order history view by permission" ON public.order_status_history
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.view'));
CREATE POLICY "order history insert by permission" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));

-- Procurement / inventory
DROP POLICY IF EXISTS "members view purchases" ON public.purchases;
DROP POLICY IF EXISTS "members insert purchases" ON public.purchases;
DROP POLICY IF EXISTS "admins manage purchases" ON public.purchases;
CREATE POLICY "purchases view by permission" ON public.purchases
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "purchases insert by permission" ON public.purchases
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchases update by permission" ON public.purchases
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchases delete by permission" ON public.purchases
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view purchase_items" ON public.purchase_items;
DROP POLICY IF EXISTS "members insert purchase_items" ON public.purchase_items;
CREATE POLICY "purchase items view by permission" ON public.purchase_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "purchase items insert by permission" ON public.purchase_items
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase items update by permission" ON public.purchase_items
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase items delete by permission" ON public.purchase_items
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "members insert stock_movements" ON public.stock_movements;
CREATE POLICY "stock movements view by permission" ON public.stock_movements
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "stock movements insert by permission" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view faulty_stocks" ON public.faulty_stocks;
DROP POLICY IF EXISTS "members insert faulty_stocks" ON public.faulty_stocks;
DROP POLICY IF EXISTS "admins manage faulty_stocks" ON public.faulty_stocks;
CREATE POLICY "faulty stock view by permission" ON public.faulty_stocks
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "faulty stock insert by permission" ON public.faulty_stocks
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "faulty stock update by permission" ON public.faulty_stocks
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "faulty stock delete by permission" ON public.faulty_stocks
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view agent_stocks" ON public.agent_stocks;
DROP POLICY IF EXISTS "members insert agent_stocks" ON public.agent_stocks;
DROP POLICY IF EXISTS "admins manage agent_stocks" ON public.agent_stocks;
CREATE POLICY "agent stock view by permission" ON public.agent_stocks
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), store_id, 'inventory.view')
    OR public.has_permission(auth.uid(), store_id, 'logistics.manage')
  );
CREATE POLICY "agent stock insert by permission" ON public.agent_stocks
  FOR INSERT TO authenticated WITH CHECK (
    public.has_permission(auth.uid(), store_id, 'inventory.manage')
    OR public.has_permission(auth.uid(), store_id, 'logistics.manage')
  );
CREATE POLICY "agent stock update by permission" ON public.agent_stocks
  FOR UPDATE TO authenticated USING (
    public.has_permission(auth.uid(), store_id, 'inventory.manage')
    OR public.has_permission(auth.uid(), store_id, 'logistics.manage')
  ) WITH CHECK (
    public.has_permission(auth.uid(), store_id, 'inventory.manage')
    OR public.has_permission(auth.uid(), store_id, 'logistics.manage')
  );
CREATE POLICY "agent stock delete by permission" ON public.agent_stocks
  FOR DELETE TO authenticated USING (
    public.has_permission(auth.uid(), store_id, 'inventory.manage')
    OR public.has_permission(auth.uid(), store_id, 'logistics.manage')
  );

DROP POLICY IF EXISTS "members view waybills" ON public.waybills;
DROP POLICY IF EXISTS "members insert waybills" ON public.waybills;
DROP POLICY IF EXISTS "admins manage waybills" ON public.waybills;
CREATE POLICY "waybills view by permission" ON public.waybills
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'logistics.manage'));
CREATE POLICY "waybills insert by permission" ON public.waybills
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'logistics.manage'));
CREATE POLICY "waybills update by permission" ON public.waybills
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'logistics.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'logistics.manage'));
CREATE POLICY "waybills delete by permission" ON public.waybills
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'logistics.manage'));

-- Supplier / purchase-order records
DROP POLICY IF EXISTS "members view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "members insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "members update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "admins manage suppliers" ON public.suppliers;
CREATE POLICY "suppliers view by permission" ON public.suppliers
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "suppliers insert by permission" ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "suppliers update by permission" ON public.suppliers
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "suppliers delete by permission" ON public.suppliers
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view supplier_payments" ON public.supplier_payments;
DROP POLICY IF EXISTS "admins manage supplier_payments" ON public.supplier_payments;
CREATE POLICY "supplier payments view by permission" ON public.supplier_payments
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'finance.view'));
CREATE POLICY "supplier payments insert by permission" ON public.supplier_payments
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'finance.manage'));
CREATE POLICY "supplier payments update by permission" ON public.supplier_payments
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'finance.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'finance.manage'));
CREATE POLICY "supplier payments delete by permission" ON public.supplier_payments
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'finance.manage'));

DROP POLICY IF EXISTS "members view purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "members insert purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "members update purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "admins manage purchase_orders" ON public.purchase_orders;
CREATE POLICY "purchase orders view by permission" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "purchase orders insert by permission" ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase orders update by permission" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase orders delete by permission" ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

DROP POLICY IF EXISTS "members view poi" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members insert poi" ON public.purchase_order_items;
DROP POLICY IF EXISTS "members update poi" ON public.purchase_order_items;
DROP POLICY IF EXISTS "admins manage poi" ON public.purchase_order_items;
CREATE POLICY "purchase order items view by permission" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "purchase order items insert by permission" ON public.purchase_order_items
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase order items update by permission" ON public.purchase_order_items
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "purchase order items delete by permission" ON public.purchase_order_items
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

-- Businesses/vendors
DROP POLICY IF EXISTS "members view businesses" ON public.businesses;
DROP POLICY IF EXISTS "members insert businesses" ON public.businesses;
DROP POLICY IF EXISTS "members update businesses" ON public.businesses;
DROP POLICY IF EXISTS "admins manage businesses" ON public.businesses;
CREATE POLICY "businesses view by permission" ON public.businesses
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.view'));
CREATE POLICY "businesses insert by permission" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "businesses update by permission" ON public.businesses
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'inventory.manage'));
CREATE POLICY "businesses delete by permission" ON public.businesses
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'inventory.manage'));

-- Sales forms: only marketing/management roles administer forms.
DROP POLICY IF EXISTS "members view sales_forms" ON public.sales_forms;
DROP POLICY IF EXISTS "public view active sales_forms" ON public.sales_forms;
DROP POLICY IF EXISTS "members manage sales_forms" ON public.sales_forms;
CREATE POLICY "sales forms view by permission" ON public.sales_forms
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'agents.view'));
CREATE POLICY "sales forms manage by permission" ON public.sales_forms
  FOR ALL TO authenticated USING (public.has_permission(auth.uid(), store_id, 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'agents.manage'));
CREATE POLICY "public active sales forms" ON public.sales_forms
  FOR SELECT TO anon USING (status = 'active');

-- Public submissions must reference an active form belonging to the same store.
DROP POLICY IF EXISTS "members view submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "public submit form" ON public.form_submissions;
CREATE POLICY "submissions view by permission" ON public.form_submissions
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(), store_id, 'agents.view')
    OR public.has_permission(auth.uid(), store_id, 'customers.view')
  );
CREATE POLICY "public submit active form" ON public.form_submissions
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales_forms sf
      WHERE sf.id = form_submissions.form_id
        AND sf.store_id = form_submissions.store_id
        AND sf.status = 'active'
    )
  );

-- Agents
DROP POLICY IF EXISTS "members view agents" ON public.agents;
DROP POLICY IF EXISTS "members insert agents" ON public.agents;
DROP POLICY IF EXISTS "members update agents" ON public.agents;
DROP POLICY IF EXISTS "admins manage agents" ON public.agents;
CREATE POLICY "agents view by permission" ON public.agents
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'agents.view'));
CREATE POLICY "agents insert by permission" ON public.agents
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'agents.manage'));
CREATE POLICY "agents update by permission" ON public.agents
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'agents.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'agents.manage'));
CREATE POLICY "agents delete by permission" ON public.agents
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'agents.manage'));

-- Call attempts are order operations.
DROP POLICY IF EXISTS "members view call attempts" ON public.order_call_attempts;
DROP POLICY IF EXISTS "members insert call attempts" ON public.order_call_attempts;
DROP POLICY IF EXISTS "admins manage call attempts" ON public.order_call_attempts;
CREATE POLICY "call attempts view by permission" ON public.order_call_attempts
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.view'));
CREATE POLICY "call attempts insert by permission" ON public.order_call_attempts
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));
CREATE POLICY "call attempts update by permission" ON public.order_call_attempts
  FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.manage'))
  WITH CHECK (public.has_permission(auth.uid(), store_id, 'orders.manage'));
CREATE POLICY "call attempts delete by permission" ON public.order_call_attempts
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), store_id, 'orders.manage'));

-- Remove anonymous table access except the explicitly public form flows.
REVOKE ALL ON TABLE public.customers, public.order_items, public.order_status_history,
  public.purchases, public.purchase_items, public.stock_movements, public.faulty_stocks,
  public.agent_stocks, public.waybills, public.businesses, public.suppliers,
  public.supplier_payments, public.purchase_orders, public.purchase_order_items,
  public.agents, public.order_call_attempts
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers, public.order_items,
  public.order_status_history, public.purchases, public.purchase_items,
  public.stock_movements, public.faulty_stocks, public.agent_stocks, public.waybills,
  public.businesses, public.suppliers, public.supplier_payments, public.purchase_orders,
  public.purchase_order_items, public.agents, public.order_call_attempts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_forms, public.form_submissions
TO authenticated;
GRANT SELECT ON TABLE public.sales_forms TO anon;
GRANT INSERT ON TABLE public.form_submissions TO anon;
