
-- Phase 3: low-stock reorder points
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reorder_point integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_low_stock
  ON public.products(store_id) WHERE stock_qty <= reorder_point;
