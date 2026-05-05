-- Allow anonymous order/customer creation when submitting an active sales form.
-- This ensures public form submissions land in the store's CRM and Orders.
CREATE POLICY "public form creates customer"
ON public.customers FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales_forms f WHERE f.store_id = customers.store_id AND f.status = 'active')
);

CREATE POLICY "public form creates order"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales_forms f WHERE f.store_id = orders.store_id AND f.status = 'active')
);

CREATE POLICY "public form creates order_items"
ON public.order_items FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sales_forms f WHERE f.store_id = order_items.store_id AND f.status = 'active')
);

-- Allow anon to look up an existing customer by store/phone for de-duplication.
CREATE POLICY "public form lookup customer"
ON public.customers FOR SELECT
TO anon
USING (
  EXISTS (SELECT 1 FROM public.sales_forms f WHERE f.store_id = customers.store_id AND f.status = 'active')
);
