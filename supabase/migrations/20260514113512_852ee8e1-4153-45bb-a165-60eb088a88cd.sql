
-- 1. Extend subscriptions with grace_period_ends_at if missing
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

-- subscriptions.status is currently text — keep text but document allowed values via CHECK
DO $$ BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('trialing','active','grace_period','past_due','suspended','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN check_violation THEN NULL;
END $$;

-- 2. Subscription history audit
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view sub history" ON public.subscription_history;
CREATE POLICY "members view sub history" ON public.subscription_history FOR SELECT
  USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "superadmins manage sub history" ON public.subscription_history;
CREATE POLICY "superadmins manage sub history" ON public.subscription_history FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sub_history_store_created
  ON public.subscription_history(store_id, created_at DESC);

-- 3. Trigger to log every status transition
CREATE OR REPLACE FUNCTION public.tg_subscription_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.subscription_history(store_id, from_status, to_status, reason)
    VALUES (NEW.store_id, OLD.status, NEW.status, 'auto');
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.subscription_history(store_id, from_status, to_status, reason)
    VALUES (NEW.store_id, NULL, NEW.status, 'created');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscriptions_history ON public.subscriptions;
CREATE TRIGGER subscriptions_history
AFTER INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_history();

-- 4. Lifecycle advancer (daily)
CREATE OR REPLACE FUNCTION public.advance_subscription_lifecycle()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- trialing → grace_period when trial expired and no payment
  UPDATE public.subscriptions
  SET status = 'grace_period',
      grace_period_ends_at = COALESCE(grace_period_ends_at, now() + interval '7 days'),
      updated_at = now()
  WHERE status = 'trialing'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();

  -- active → grace_period when next_billing missed
  UPDATE public.subscriptions
  SET status = 'grace_period',
      grace_period_ends_at = COALESCE(grace_period_ends_at, now() + interval '7 days'),
      updated_at = now()
  WHERE status = 'active'
    AND next_billing_at IS NOT NULL
    AND next_billing_at < now();

  -- grace_period → past_due when grace expired
  UPDATE public.subscriptions
  SET status = 'past_due', updated_at = now()
  WHERE status = 'grace_period'
    AND grace_period_ends_at IS NOT NULL
    AND grace_period_ends_at < now();

  -- past_due > 14 days → suspended (also flips store status)
  UPDATE public.subscriptions
  SET status = 'suspended', updated_at = now()
  WHERE status = 'past_due'
    AND updated_at < now() - interval '14 days';

  UPDATE public.stores
  SET status = 'suspended', suspended_at = COALESCE(suspended_at, now())
  WHERE id IN (
    SELECT store_id FROM public.subscriptions WHERE status = 'suspended'
  ) AND status = 'active';
END $$;

REVOKE EXECUTE ON FUNCTION public.advance_subscription_lifecycle() FROM anon, public;
