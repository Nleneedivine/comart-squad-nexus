
CREATE OR REPLACE FUNCTION public.tg_orders_notify_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  cust_name text;
BEGIN
  SELECT name INTO cust_name FROM public.customers WHERE id = NEW.customer_id;
  FOR r IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE store_id = NEW.store_id
      AND role IN ('owner','admin','manager','head_of_operations')
      AND COALESCE(is_suspended, false) = false
  LOOP
    INSERT INTO public.notifications (store_id, user_id, title, body, link, kind)
    VALUES (
      NEW.store_id,
      r.user_id,
      'New order received',
      COALESCE('From ' || cust_name, 'A new order was just placed'),
      '/orders/' || NEW.id::text,
      'new_order'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_new ON public.orders;
CREATE TRIGGER orders_notify_new
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_notify_new();
