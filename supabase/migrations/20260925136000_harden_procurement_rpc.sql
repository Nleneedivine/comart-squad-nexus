-- Harden SECURITY DEFINER procurement mutation.
-- Receiving stock is an inventory-management operation, not a generic member action.

CREATE OR REPLACE FUNCTION public.receive_purchase_order_items(_po_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  po_row public.purchase_orders%ROWTYPE;
  poi_row public.purchase_order_items%ROWTYPE;
  prod_row public.products%ROWTYPE;
  received_qty int;
  damaged_qty int;
  new_stock int;
  total_ordered int;
  total_received int;
  new_status text;
BEGIN
  SELECT *
  INTO po_row
  FROM public.purchase_orders
  WHERE id = _po_id
  FOR UPDATE;

  IF po_row.id IS NULL THEN
    RAISE EXCEPTION 'PO not found';
  END IF;

  IF NOT public.has_permission(auth.uid(), po_row.store_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be an array';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT *
    INTO poi_row
    FROM public.purchase_order_items
    WHERE id = NULLIF(item->>'id', '')::uuid
      AND purchase_order_id = _po_id
      AND store_id = po_row.store_id
    FOR UPDATE;

    IF poi_row.id IS NULL THEN
      RAISE EXCEPTION 'Purchase order item not found';
    END IF;

    received_qty := GREATEST(COALESCE((item->>'received')::int, 0), 0);
    damaged_qty := GREATEST(COALESCE((item->>'damaged')::int, 0), 0);

    IF received_qty + damaged_qty > (poi_row.quantity - poi_row.received_qty - poi_row.damaged_qty) THEN
      RAISE EXCEPTION 'Received quantity exceeds remaining quantity for item %', poi_row.id;
    END IF;

    UPDATE public.purchase_order_items
    SET received_qty = received_qty + received_qty,
        damaged_qty = damaged_qty + damaged_qty
    WHERE id = poi_row.id;

    IF poi_row.product_id IS NOT NULL AND received_qty > 0 THEN
      SELECT *
      INTO prod_row
      FROM public.products
      WHERE id = poi_row.product_id
        AND store_id = po_row.store_id
      FOR UPDATE;

      IF prod_row.id IS NULL THEN
        RAISE EXCEPTION 'Product not found';
      END IF;

      new_stock := COALESCE(prod_row.stock_qty, 0) + received_qty;

      UPDATE public.products
      SET stock_qty = new_stock,
          updated_at = now()
      WHERE id = prod_row.id;

      INSERT INTO public.stock_movements(
        store_id, product_id, product_name, type, qty_change, balance, reference
      )
      VALUES (
        po_row.store_id, prod_row.id, poi_row.product_name, 'in',
        received_qty, new_stock, 'PO ' || po_row.po_number
      );
    END IF;
  END LOOP;

  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(received_qty + damaged_qty), 0)
  INTO total_ordered, total_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = _po_id
    AND store_id = po_row.store_id;

  IF total_received >= total_ordered AND total_ordered > 0 THEN
    new_status := 'received';
  ELSIF total_received > 0 THEN
    new_status := 'partially_received';
  ELSE
    new_status := po_row.status;
  END IF;

  UPDATE public.purchase_orders
  SET status = new_status,
      received_at = CASE
        WHEN new_status = 'received' THEN COALESCE(received_at, now())
        ELSE received_at
      END,
      updated_at = now()
  WHERE id = _po_id;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order_items(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_items(uuid, jsonb)
  TO authenticated, service_role;
