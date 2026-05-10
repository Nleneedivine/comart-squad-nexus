
-- Suspension flag
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Add assignment fields to orders if missing
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS expire_pending boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to);

-- Workload rollup table
CREATE TABLE IF NOT EXISTS public.staff_workload_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  period_start date NOT NULL,
  assigned_count int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  cancelled_count int NOT NULL DEFAULT 0,
  expired_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, staff_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_sws_store_period ON public.staff_workload_stats(store_id, period_start);
CREATE INDEX IF NOT EXISTS idx_sws_staff ON public.staff_workload_stats(staff_id);

ALTER TABLE public.staff_workload_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view workload stats" ON public.staff_workload_stats
FOR SELECT USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));

CREATE POLICY "admins manage workload stats" ON public.staff_workload_stats
FOR ALL USING (public.is_store_admin(auth.uid(), store_id))
WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- Trigger function: update rollup on order changes
CREATE OR REPLACE FUNCTION public.tg_orders_update_workload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket date := CURRENT_DATE;
  sid uuid;
BEGIN
  -- New assignment
  IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL) THEN
    INSERT INTO public.staff_workload_stats(store_id, staff_id, period_start, assigned_count)
    VALUES (NEW.store_id, NEW.assigned_to, bucket, 1)
    ON CONFLICT (store_id, staff_id, period_start)
    DO UPDATE SET assigned_count = staff_workload_stats.assigned_count + 1, updated_at = now();
  END IF;

  -- Status transitions
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.assigned_to IS NOT NULL THEN
    sid := NEW.assigned_to;
    IF NEW.status::text IN ('delivered','completed','fulfilled') THEN
      INSERT INTO public.staff_workload_stats(store_id, staff_id, period_start, completed_count, delivered_count)
      VALUES (NEW.store_id, sid, bucket, 1, 1)
      ON CONFLICT (store_id, staff_id, period_start)
      DO UPDATE SET completed_count = staff_workload_stats.completed_count + 1,
                    delivered_count = staff_workload_stats.delivered_count + 1,
                    updated_at = now();
    ELSIF NEW.status::text IN ('cancelled','canceled') THEN
      INSERT INTO public.staff_workload_stats(store_id, staff_id, period_start, cancelled_count)
      VALUES (NEW.store_id, sid, bucket, 1)
      ON CONFLICT (store_id, staff_id, period_start)
      DO UPDATE SET cancelled_count = staff_workload_stats.cancelled_count + 1, updated_at = now();
    ELSIF NEW.status::text IN ('expired') THEN
      INSERT INTO public.staff_workload_stats(store_id, staff_id, period_start, expired_count)
      VALUES (NEW.store_id, sid, bucket, 1)
      ON CONFLICT (store_id, staff_id, period_start)
      DO UPDATE SET expired_count = staff_workload_stats.expired_count + 1, updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_workload ON public.orders;
CREATE TRIGGER trg_orders_workload
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_update_workload();

-- Block suspended users from being assigned new work via helper
CREATE OR REPLACE FUNCTION public.is_member_active(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND store_id = _store_id AND COALESCE(is_suspended, false) = false
  ) OR EXISTS (SELECT 1 FROM public.stores WHERE id = _store_id AND owner_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_member_active(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tg_orders_update_workload() TO authenticated;
