
-- Raw webhook events (idempotency)
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  provider text NOT NULL DEFAULT 'paystack',
  event_type text NOT NULL,
  reference text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_provider_ref_unique UNIQUE (provider, reference, event_type)
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view payment events" ON public.payment_events FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage payment events" ON public.payment_events FOR ALL
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_payment_events_store ON public.payment_events(store_id, created_at DESC);

-- Ledger
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('charge','refund','chargeback','credit','adjustment')),
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  reference text,
  description text,
  event_id uuid REFERENCES public.payment_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view ledger" ON public.payment_ledger FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage ledger" ON public.payment_ledger FOR ALL
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ledger_store_created ON public.payment_ledger(store_id, created_at DESC);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  invoice_number text NOT NULL,
  period_start date,
  period_end date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paid','void')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  paystack_reference text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_unique UNIQUE (invoice_number)
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view invoices" ON public.invoices FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "admins update invoices" ON public.invoices FOR UPDATE
  USING (public.is_store_admin(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage invoices" ON public.invoices FOR ALL
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_invoices_store ON public.invoices(store_id, issued_at DESC);

-- Receipts
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  receipt_number text NOT NULL,
  amount numeric NOT NULL,
  paystack_reference text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_number_unique UNIQUE (receipt_number)
);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view receipts" ON public.receipts FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage receipts" ON public.receipts FOR ALL
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_receipts_store ON public.receipts(store_id, issued_at DESC);

-- Atomic recorder used by webhook handler
CREATE OR REPLACE FUNCTION public.record_payment_event(
  _store_id uuid,
  _event_type text,
  _reference text,
  _amount numeric,
  _status text,
  _raw jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_id uuid;
  prev_balance numeric;
  entry_type text;
BEGIN
  -- Idempotent insert
  INSERT INTO public.payment_events(store_id, event_type, reference, amount, status, raw)
  VALUES (_store_id, _event_type, _reference, _amount, _status, _raw)
  ON CONFLICT (provider, reference, event_type) DO NOTHING
  RETURNING id INTO ev_id;

  IF ev_id IS NULL THEN
    -- duplicate, no-op
    RETURN NULL;
  END IF;

  -- Map to ledger entry
  entry_type := CASE
    WHEN _event_type IN ('charge.success','subscription.payment') THEN 'charge'
    WHEN _event_type LIKE 'refund.%' THEN 'refund'
    WHEN _event_type LIKE 'chargeback.%' THEN 'chargeback'
    ELSE NULL
  END;

  IF entry_type IS NOT NULL AND _store_id IS NOT NULL THEN
    SELECT COALESCE(balance_after, 0) INTO prev_balance
      FROM public.payment_ledger
      WHERE store_id = _store_id
      ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.payment_ledger(store_id, entry_type, amount, balance_after, reference, description, event_id)
    VALUES (
      _store_id,
      entry_type,
      CASE WHEN entry_type = 'charge' THEN _amount ELSE -_amount END,
      COALESCE(prev_balance, 0) + (CASE WHEN entry_type = 'charge' THEN _amount ELSE -_amount END),
      _reference,
      _event_type,
      ev_id
    );
  END IF;

  UPDATE public.payment_events SET processed_at = now() WHERE id = ev_id;
  RETURN ev_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_payment_event(uuid, text, text, numeric, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_payment_event(uuid, text, text, numeric, text, jsonb) TO authenticated;
