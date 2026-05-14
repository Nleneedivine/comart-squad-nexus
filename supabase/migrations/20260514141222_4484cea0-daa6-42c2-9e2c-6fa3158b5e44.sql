-- Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  category text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_suppliers_store ON public.suppliers(store_id);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view suppliers" ON public.suppliers FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "members update suppliers" ON public.suppliers FOR UPDATE USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage suppliers" ON public.suppliers FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE TRIGGER tg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Supplier payments
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_payments_store ON public.supplier_payments(store_id);
CREATE INDEX idx_supplier_payments_supplier ON public.supplier_payments(supplier_id);
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view supplier_payments" ON public.supplier_payments FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage supplier_payments" ON public.supplier_payments FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Purchase orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft|approved|partially_received|received|cancelled
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  expected_date date,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  received_at timestamptz,
  invoice_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_store ON public.purchase_orders(store_id);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON public.purchase_orders(status);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view purchase_orders" ON public.purchase_orders FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert purchase_orders" ON public.purchase_orders FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "members update purchase_orders" ON public.purchase_orders FOR UPDATE USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage purchase_orders" ON public.purchase_orders FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE TRIGGER tg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Purchase order items
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  received_qty integer NOT NULL DEFAULT 0,
  damaged_qty integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poi_po ON public.purchase_order_items(purchase_order_id);
CREATE INDEX idx_poi_store ON public.purchase_order_items(store_id);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view poi" ON public.purchase_order_items FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert poi" ON public.purchase_order_items FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "members update poi" ON public.purchase_order_items FOR UPDATE USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage poi" ON public.purchase_order_items FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Stock receiving function: applies received quantities, updates product stock + movements + PO status
CREATE OR REPLACE FUNCTION public.receive_purchase_order_items(_po_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  item jsonb;
  poi_row record;
  po_row record;
  prod_row record;
  new_stock int;
  total_ordered int;
  total_received int;
  new_status text;
BEGIN
  SELECT * INTO po_row FROM public.purchase_orders WHERE id = _po_id;
  IF po_row IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF NOT public.is_store_member(auth.uid(), po_row.store_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO poi_row FROM public.purchase_order_items
      WHERE id = (item->>'id')::uuid AND purchase_order_id = _po_id;
    IF poi_row IS NULL THEN CONTINUE; END IF;

    UPDATE public.purchase_order_items
      SET received_qty = received_qty + GREATEST(COALESCE((item->>'received')::int, 0), 0),
          damaged_qty = damaged_qty + GREATEST(COALESCE((item->>'damaged')::int, 0), 0)
      WHERE id = poi_row.id;

    IF poi_row.product_id IS NOT NULL AND COALESCE((item->>'received')::int, 0) > 0 THEN
      SELECT * INTO prod_row FROM public.products WHERE id = poi_row.product_id;
      new_stock := COALESCE(prod_row.stock_qty, 0) + (item->>'received')::int;
      UPDATE public.products SET stock_qty = new_stock WHERE id = poi_row.product_id;
      INSERT INTO public.stock_movements(store_id, product_id, product_name, type, qty_change, balance, reference)
        VALUES (po_row.store_id, poi_row.product_id, poi_row.product_name, 'in', (item->>'received')::int, new_stock,
          'PO ' || po_row.po_number);
    END IF;
  END LOOP;

  -- Recompute status
  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(received_qty + damaged_qty),0)
    INTO total_ordered, total_received
    FROM public.purchase_order_items WHERE purchase_order_id = _po_id;

  IF total_received >= total_ordered AND total_ordered > 0 THEN new_status := 'received';
  ELSIF total_received > 0 THEN new_status := 'partially_received';
  ELSE new_status := po_row.status; END IF;

  UPDATE public.purchase_orders
    SET status = new_status,
        received_at = CASE WHEN new_status = 'received' THEN now() ELSE received_at END
    WHERE id = _po_id;
END $$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order_items(uuid, jsonb) TO authenticated;