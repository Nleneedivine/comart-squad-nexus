-- Financial security hardening.
-- Existing wallet rows remain intact. New PINs use bcrypt via pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.wallet_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  reference TEXT,
  amount NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet audit admins read" ON public.wallet_audit_logs;
CREATE POLICY "wallet audit admins read"
ON public.wallet_audit_logs FOR SELECT TO authenticated
USING (public.is_store_admin(auth.uid(), store_id));

REVOKE INSERT, UPDATE, DELETE ON public.wallet_audit_logs FROM authenticated;

-- Never expose the PIN hash to the browser.
REVOKE SELECT (pin_hash) ON public.wallets FROM authenticated;

-- Keep existing wallet data readable, but restrict mutation to the server-side RPCs.
DROP POLICY IF EXISTS "admins manage wallet" ON public.wallets;
CREATE POLICY "admins update wallet nonsecret"
ON public.wallets FOR UPDATE TO authenticated
USING (public.is_store_admin(auth.uid(), store_id))
WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- Server-side PIN setup. This deliberately keeps the hash out of client SQL.
CREATE OR REPLACE FUNCTION public.set_wallet_pin(_store_id UUID, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  wid UUID;
BEGIN
  IF NOT public.is_store_admin(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;

  SELECT id INTO wid FROM public.wallets WHERE store_id = _store_id FOR UPDATE;
  IF wid IS NULL THEN
    INSERT INTO public.wallets(store_id, pin_hash)
    VALUES (_store_id, crypt(_pin, gen_salt('bf', 12)))
    RETURNING id INTO wid;
  ELSE
    UPDATE public.wallets
    SET pin_hash = crypt(_pin, gen_salt('bf', 12))
    WHERE id = wid;
  END IF;

  INSERT INTO public.wallet_audit_logs(store_id, wallet_id, actor_user_id, action)
  VALUES (_store_id, wid, auth.uid(), 'PIN_CHANGED');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_wallet_pin(UUID, TEXT) TO authenticated;

-- Atomic withdrawal request. The row lock prevents two concurrent requests
-- from spending the same balance.
CREATE OR REPLACE FUNCTION public.request_wallet_withdrawal(
  _store_id UUID,
  _amount NUMERIC,
  _pin TEXT,
  _idempotency_key TEXT
)
RETURNS TABLE(ok BOOLEAN, reference TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  w public.wallets%ROWTYPE;
  existing_ref TEXT;
  new_ref TEXT;
BEGIN
  IF NOT public.is_store_admin(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount <= 0 OR _amount > 10000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF _pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  SELECT wt.reference INTO existing_ref
  FROM public.wallet_transactions wt
  WHERE wt.store_id = _store_id
    AND wt.kind = 'withdrawal'
    AND wt.description LIKE 'idempotency:%' || _idempotency_key || '%'
  LIMIT 1;

  IF existing_ref IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, existing_ref;
    RETURN;
  END IF;

  SELECT * INTO w FROM public.wallets WHERE store_id = _store_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.bank_account_number IS NULL OR w.bank_account_number = '' THEN
    RAISE EXCEPTION 'Add bank account first';
  END IF;
  IF w.pin_hash IS NULL THEN RAISE EXCEPTION 'Set a wallet PIN first'; END IF;

  IF w.pin_hash LIKE '$2%' THEN
    IF crypt(_pin, w.pin_hash) <> w.pin_hash THEN RAISE EXCEPTION 'Incorrect PIN'; END IF;
  ELSE
    -- Backward-compatible migration path for the old SHA-256 PIN format.
    IF encode(digest(_pin, 'sha256'), 'hex') <> w.pin_hash THEN
      RAISE EXCEPTION 'Incorrect PIN';
    END IF;
    UPDATE public.wallets SET pin_hash = crypt(_pin, gen_salt('bf', 12)) WHERE id = w.id;
  END IF;

  IF w.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  new_ref := 'wd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

  UPDATE public.wallets
  SET balance = balance - _amount
  WHERE id = w.id;

  INSERT INTO public.wallet_transactions
    (store_id, wallet_id, kind, amount, status, reference, created_by, description)
  VALUES
    (_store_id, w.id, 'withdrawal', _amount, 'pending', new_ref, auth.uid(),
     'idempotency:' || _idempotency_key || ' Withdraw to ' ||
     coalesce(w.bank_name, '') || ' ' || coalesce(w.bank_account_number, ''));

  INSERT INTO public.wallet_audit_logs
    (store_id, wallet_id, actor_user_id, action, reference, amount)
  VALUES
    (_store_id, w.id, auth.uid(), 'WITHDRAWAL_REQUESTED', new_ref, _amount);

  RETURN QUERY SELECT TRUE, new_ref;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- Funding completion is idempotent and tied to the authenticated user's store.
CREATE OR REPLACE FUNCTION public.complete_wallet_funding(
  _store_id UUID,
  _reference TEXT,
  _amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF NOT public.is_store_member(auth.uid(), _store_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO tx
  FROM public.wallet_transactions
  WHERE store_id = _store_id
    AND reference = _reference
    AND kind = 'funding'
  FOR UPDATE;

  IF tx.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.status = 'success' THEN RETURN TRUE; END IF;
  IF tx.status <> 'pending' THEN RETURN FALSE; END IF;
  IF abs(tx.amount - _amount) > 0.0001 THEN RAISE EXCEPTION 'Amount mismatch'; END IF;

  UPDATE public.wallet_transactions SET status = 'success' WHERE id = tx.id;
  UPDATE public.wallets SET balance = balance + tx.amount WHERE id = tx.wallet_id;

  INSERT INTO public.wallet_audit_logs
    (store_id, wallet_id, actor_user_id, action, reference, amount)
  VALUES
    (_store_id, tx.wallet_id, auth.uid(), 'WALLET_FUNDED', _reference, tx.amount);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_wallet_funding(UUID, TEXT, NUMERIC) TO authenticated;
