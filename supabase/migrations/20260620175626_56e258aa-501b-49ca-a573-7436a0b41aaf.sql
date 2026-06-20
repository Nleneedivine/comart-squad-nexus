
-- Call orders pipeline table
CREATE TYPE public.call_order_status AS ENUM ('confirmed','delivered','rescheduled','dead','cancelled');

CREATE TABLE public.call_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name text,
  call_received boolean NOT NULL DEFAULT false,
  call_valid boolean NOT NULL DEFAULT false,
  status public.call_order_status NOT NULL DEFAULT 'confirmed',
  bottles_sold integer NOT NULL DEFAULT 0,
  bottles_paid integer NOT NULL DEFAULT 0,
  amount_remitted numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX call_orders_store_date_idx ON public.call_orders(store_id, order_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_orders TO authenticated;
GRANT ALL ON public.call_orders TO service_role;

ALTER TABLE public.call_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view store call orders"
  ON public.call_orders FOR SELECT TO authenticated
  USING (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Members can insert store call orders"
  ON public.call_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Members can update store call orders"
  ON public.call_orders FOR UPDATE TO authenticated
  USING (public.is_store_member(auth.uid(), store_id))
  WITH CHECK (public.is_store_member(auth.uid(), store_id));

CREATE POLICY "Admins or creator can delete call orders"
  ON public.call_orders FOR DELETE TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id) OR created_by = auth.uid());

CREATE TRIGGER call_orders_updated_at
  BEFORE UPDATE ON public.call_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
