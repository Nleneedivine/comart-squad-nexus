-- COMMISSIONS
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  order_id uuid NOT NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  percent numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, agent_id)
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view commissions" ON public.commissions FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage commissions" ON public.commissions FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE TRIGGER commissions_set_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_commissions_agent ON public.commissions(store_id, agent_id, status);

-- REFUNDS
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'requested',
  requested_by uuid,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view refunds" ON public.refunds FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE POLICY "members request refunds" ON public.refunds FOR INSERT WITH CHECK (is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage refunds" ON public.refunds FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE TRIGGER refunds_set_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_refunds_store ON public.refunds(store_id, status);

-- DAILY REPORT SNAPSHOTS
CREATE TABLE public.daily_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  report_date date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  cancelled_count integer NOT NULL DEFAULT 0,
  top_product text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, report_date)
);
ALTER TABLE public.daily_report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view daily reports" ON public.daily_report_snapshots FOR SELECT USING (is_store_member(auth.uid(), store_id) OR is_superadmin(auth.uid()));
CREATE POLICY "admins manage daily reports" ON public.daily_report_snapshots FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));

-- COMMISSION TRIGGER on orders
CREATE OR REPLACE FUNCTION public.tg_orders_create_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  agent_pct numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status::text IN ('delivered','completed','fulfilled')
     AND OLD.status::text IS DISTINCT FROM NEW.status::text
     AND NEW.assigned_to IS NOT NULL THEN
    SELECT commission_pct INTO agent_pct FROM public.agents WHERE id = NEW.assigned_to AND store_id = NEW.store_id;
    IF agent_pct IS NOT NULL AND agent_pct > 0 THEN
      INSERT INTO public.commissions(store_id, agent_id, order_id, base_amount, percent, amount, status)
      VALUES (NEW.store_id, NEW.assigned_to, NEW.id, COALESCE(NEW.amount,0), agent_pct, COALESCE(NEW.amount,0) * agent_pct / 100.0, 'pending')
      ON CONFLICT (order_id, agent_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_orders_create_commission ON public.orders;
CREATE TRIGGER tg_orders_create_commission AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_orders_create_commission();

-- DAILY REPORT FUNCTION
CREATE OR REPLACE FUNCTION public.generate_daily_reports()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := (CURRENT_DATE - INTERVAL '1 day')::date;
BEGIN
  INSERT INTO public.daily_report_snapshots(store_id, report_date, orders_count, revenue, delivered_count, cancelled_count, top_product)
  SELECT
    o.store_id,
    d,
    COUNT(*),
    COALESCE(SUM(o.amount),0),
    COUNT(*) FILTER (WHERE o.status::text IN ('delivered','completed','fulfilled')),
    COUNT(*) FILTER (WHERE o.status::text IN ('cancelled','canceled')),
    (SELECT oi.product_name FROM public.order_items oi
       JOIN public.orders o2 ON o2.id = oi.order_id
       WHERE o2.store_id = o.store_id AND o2.created_at::date = d
       GROUP BY oi.product_name ORDER BY SUM(oi.quantity) DESC NULLS LAST LIMIT 1)
  FROM public.orders o
  WHERE o.created_at::date = d
  GROUP BY o.store_id
  ON CONFLICT (store_id, report_date) DO UPDATE
    SET orders_count = EXCLUDED.orders_count,
        revenue = EXCLUDED.revenue,
        delivered_count = EXCLUDED.delivered_count,
        cancelled_count = EXCLUDED.cancelled_count,
        top_product = EXCLUDED.top_product;
END $$;

-- Schedule daily at 1am UTC
SELECT cron.schedule('generate-daily-reports', '0 1 * * *', $$ SELECT public.generate_daily_reports(); $$);