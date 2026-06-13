
-- Stage 2: weighted distribution
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assignment_weight integer NOT NULL DEFAULT 1;

-- Stage 4: attendance verification fields
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS clock_in_photo_url text,
  ADD COLUMN IF NOT EXISTS clock_out_photo_url text,
  ADD COLUMN IF NOT EXISTS clock_in_lat numeric,
  ADD COLUMN IF NOT EXISTS clock_in_lng numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lat numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lng numeric;

-- Store-level attendance policy
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS resumption_time time,
  ADD COLUMN IF NOT EXISTS late_deadline time;

-- Updated auto-assign with 'weighted' strategy
CREATE OR REPLACE FUNCTION public.auto_assign_order(_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  o record; s record; pick uuid;
  total_weight bigint; r bigint; acc bigint := 0;
  cand record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o IS NULL OR o.assigned_to IS NOT NULL THEN RETURN o.assigned_to; END IF;
  SELECT * INTO s FROM public.stores WHERE id = o.store_id;
  IF NOT COALESCE(s.auto_assign_enabled, true) THEN RETURN NULL; END IF;

  IF COALESCE(s.auto_assign_strategy,'least_load') = 'weighted' THEN
    SELECT COALESCE(SUM(GREATEST(ur.assignment_weight,0)),0) INTO total_weight
      FROM public.user_roles ur
      WHERE ur.store_id = o.store_id
        AND COALESCE(ur.is_suspended,false)=false
        AND ur.role IN ('sales_rep','order_manager','customer_care','manager','admin','owner');
    IF total_weight > 0 THEN
      r := floor(random() * total_weight)::bigint;
      FOR cand IN
        SELECT ur.user_id, GREATEST(ur.assignment_weight,0) AS w
          FROM public.user_roles ur
          WHERE ur.store_id = o.store_id
            AND COALESCE(ur.is_suspended,false)=false
            AND ur.role IN ('sales_rep','order_manager','customer_care','manager','admin','owner')
            AND ur.assignment_weight > 0
          ORDER BY ur.user_id
      LOOP
        acc := acc + cand.w;
        IF r < acc THEN pick := cand.user_id; EXIT; END IF;
      END LOOP;
    END IF;
  ELSIF COALESCE(s.auto_assign_strategy,'least_load') = 'round_robin' THEN
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
END $function$;
