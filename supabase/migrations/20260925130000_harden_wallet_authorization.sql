-- Finalize wallet authorization boundaries.
-- All browser-facing wallet mutations are permission checked server/RPC operations.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_withdrawal_idempotency
  ON public.wallet_transactions(store_id, idempotency_key)
  WHERE kind = 'withdrawal' AND idempotency_key IS NOT NULL;

-- Direct browser mutation of wallet rows is no longer part of the application contract.
DROP POLICY IF EXISTS "admins update wallet nonsecret" ON public.wallets;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_wallet_bank_details(
  _store_id UUID,
  _bank_name TEXT,
  _bank_account_number TEXT,
  _bank_account_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  wid UUID;
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'wallet.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _bank_name IS NULL OR length(trim(_bank_name)) < 2 OR length(trim(_bank_name)) > 120 THEN
    RAISE EXCEPTION 'Invalid bank name';
  END IF;
  IF _bank_account_number !~ '^[0-9]{10,20}$' THEN
    RAISE EXCEPTION 'Invalid bank account number';
  END IF;
  IF _bank_account_name IS NULL OR length(trim(_bank_account_name)) < 2 OR length(trim(_bank_account_name)) > 160 THEN
    RAISE EXCEPTION 'Invalid account name';
  END IF;

  SELECT id INTO wid
  FROM public.wallets
  WHERE store_id = _store_id
  FOR UPDATE;

  IF wid IS NULL THEN
    INSERT INTO public.wallets (
      store_id, bank_name, bank_account_number, bank_account_name
    )
    VALUES (
      _store_id, trim(_bank_name), _bank_account_number, trim(_bank_account_name)
    )
    RETURNING id INTO wid;
  ELSE
    UPDATE public.wallets
    SET bank_name = trim(_bank_name),
        bank_account_number = _bank_account_number,
        bank_account_name = trim(_bank_account_name),
        updated_at = now()
    WHERE id = wid;
  END IF;

  INSERT INTO public.wallet_audit_logs (
    store_id, wallet_id, actor_user_id, action, metadata
  )
  VALUES (
    _store_id, wid, auth.uid(), 'BANK_DETAILS_CHANGED',
    jsonb_build_object('bank_name', trim(_bank_name))
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_wallet_bank_details(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Use the granular permission model for financial actions.
CREATE OR REPLACE FUNCTION public.set_wallet_pin(_store_id UUID, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  wid UUID;
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'wallet.manage') THEN
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
    SET pin_hash = crypt(_pin, gen_salt('bf', 12)), updated_at = now()
    WHERE id = wid;
  END IF;

  INSERT INTO public.wallet_audit_logs(store_id, wallet_id, actor_user_id, action)
  VALUES (_store_id, wid, auth.uid(), 'PIN_CHANGED');

  RETURN TRUE;
END;
$$;

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
  IF NOT public.has_permission(auth.uid(), _store_id, 'wallet.withdraw') THEN
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
    AND wt.idempotency_key = _idempotency_key
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
    IF encode(digest(_pin, 'sha256'), 'hex') <> w.pin_hash THEN
      RAISE EXCEPTION 'Incorrect PIN';
    END IF;
    UPDATE public.wallets
    SET pin_hash = crypt(_pin, gen_salt('bf', 12)), updated_at = now()
    WHERE id = w.id;
  END IF;

  IF w.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  new_ref := 'wd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

  UPDATE public.wallets
  SET balance = balance - _amount, updated_at = now()
  WHERE id = w.id;

  INSERT INTO public.wallet_transactions
    (store_id, wallet_id, kind, amount, status, reference, idempotency_key, created_by, description)
  VALUES
    (_store_id, w.id, 'withdrawal', _amount, 'pending', new_ref, _idempotency_key, auth.uid(),
     'Withdraw to ' || coalesce(w.bank_name, '') || ' ' || coalesce(w.bank_account_number, ''));

  INSERT INTO public.wallet_audit_logs
    (store_id, wallet_id, actor_user_id, action, reference, amount)
  VALUES
    (_store_id, w.id, auth.uid(), 'WITHDRAWAL_REQUESTED', new_ref, _amount);

  RETURN QUERY SELECT TRUE, new_ref;
END;
$$;

-- The old client-callable funding completion function is removed. Completion
-- is now an internal server operation after Paystack verification.
DROP FUNCTION IF EXISTS public.complete_wallet_funding(UUID, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.complete_wallet_funding(
  _store_id UUID,
  _reference TEXT,
  _amount NUMERIC,
  _actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF NOT public.is_store_member(_actor_user_id, _store_id) THEN
    RAISE EXCEPTION 'Actor is not a store member';
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
  UPDATE public.wallets
  SET balance = balance + tx.amount, updated_at = now()
  WHERE id = tx.wallet_id;

  INSERT INTO public.wallet_audit_logs
    (store_id, wallet_id, actor_user_id, action, reference, amount)
  VALUES
    (_store_id, tx.wallet_id, _actor_user_id, 'WALLET_FUNDED', _reference, tx.amount);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_wallet_funding(UUID, TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_wallet_funding(UUID, TEXT, NUMERIC, UUID) TO service_role;

-- write_audit_log is trigger-only; it must not be an arbitrary public RPC.
REVOKE ALL ON FUNCTION public.write_audit_log(UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

-- Prevent arbitrary callers from asking has_permission about another user's identity.
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _store_id UUID,
  _permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND ur.store_id = _store_id
      AND rp.permission_key = _permission
  )
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.owner_id = _user_id
  );
END;
$$;
