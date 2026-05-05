
-- Extend order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'shipped';

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  state TEXT,
  city TEXT,
  address TEXT,
  full_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view customers" ON public.customers FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert customers" ON public.customers FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage customers" ON public.customers FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE POLICY "members update customers" ON public.customers FOR UPDATE USING (is_store_member(auth.uid(), store_id));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  buying_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view products" ON public.products FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert products" ON public.products FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "members update products" ON public.products FOR UPDATE USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage products" ON public.products FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view order_items" ON public.order_items FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert order_items" ON public.order_items FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage order_items" ON public.order_items FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Order status history
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  changed_by UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view order_history" ON public.order_status_history FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert order_history" ON public.order_status_history FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));

-- Purchases
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view purchases" ON public.purchases FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert purchases" ON public.purchases FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage purchases" ON public.purchases FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view purchase_items" ON public.purchase_items FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert purchase_items" ON public.purchase_items FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));

-- Stock movements
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL,
  qty_change INTEGER NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view stock_movements" ON public.stock_movements FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert stock_movements" ON public.stock_movements FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));

-- Faulty stocks
CREATE TABLE public.faulty_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  reported_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.faulty_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view faulty_stocks" ON public.faulty_stocks FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert faulty_stocks" ON public.faulty_stocks FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage faulty_stocks" ON public.faulty_stocks FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Agent stocks
CREATE TABLE public.agent_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_name TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view agent_stocks" ON public.agent_stocks FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert agent_stocks" ON public.agent_stocks FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage agent_stocks" ON public.agent_stocks FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Waybills
CREATE TABLE public.waybills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  waybill_number TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_address TEXT,
  destination TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  dispatched_by TEXT,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waybills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view waybills" ON public.waybills FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert waybills" ON public.waybills FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage waybills" ON public.waybills FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- Businesses (suppliers/vendors)
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view businesses" ON public.businesses FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert businesses" ON public.businesses FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "members update businesses" ON public.businesses FOR UPDATE USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage businesses" ON public.businesses FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
