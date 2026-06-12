
CREATE OR REPLACE FUNCTION public.tg_orders_notify_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  cust_name text;
  cust_phone text;
  dup_count int := 0;
BEGIN
  SELECT name, phone INTO cust_name, cust_phone FROM public.customers WHERE id = NEW.customer_id;

  IF cust_name IS NOT NULL AND cust_phone IS NOT NULL THEN
    SELECT count(*) INTO dup_count
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.store_id = NEW.store_id
      AND o.id <> NEW.id
      AND o.created_at > now() - interval '24 hours'
      AND lower(btrim(c.name)) = lower(btrim(cust_name))
      AND regexp_replace(coalesce(c.phone,''), '\s+', '', 'g') = regexp_replace(cust_phone, '\s+', '', 'g');
  END IF;

  FOR r IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE store_id = NEW.store_id
      AND role IN ('owner','admin','manager','head_of_operations')
      AND COALESCE(is_suspended, false) = false
  LOOP
    INSERT INTO public.notifications (store_id, user_id, title, body, link, kind)
    VALUES (
      NEW.store_id, r.user_id,
      'New order received',
      COALESCE('From ' || cust_name, 'A new order was just placed'),
      '/orders/' || NEW.id::text,
      'new_order'
    );

    IF dup_count > 0 THEN
      INSERT INTO public.notifications (store_id, user_id, title, body, link, kind)
      VALUES (
        NEW.store_id, r.user_id,
        'Possible duplicate order',
        'Matches ' || dup_count || ' recent order(s) from ' || COALESCE(cust_name,'this customer'),
        '/orders/' || NEW.id::text,
        'duplicate_order'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
