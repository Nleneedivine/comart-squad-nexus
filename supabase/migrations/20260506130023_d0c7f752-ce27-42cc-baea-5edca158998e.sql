
-- 1. Subscription discount fields
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_note text,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='subscriptions_discount_type_chk') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_discount_type_chk
      CHECK (discount_type IN ('none','waived','percent','fixed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.compute_subscription_amount(_store_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN s.discount_type = 'waived' THEN 0
    WHEN s.discount_type = 'percent' THEN GREATEST(s.amount - (s.amount * s.discount_value / 100), 0)
    WHEN s.discount_type = 'fixed' THEN GREATEST(s.discount_value, 0)
    ELSE s.amount
  END FROM public.subscriptions s WHERE s.store_id = _store_id LIMIT 1;
$$;

-- 2. Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notif_type text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  toast boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notif_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notif prefs" ON public.notification_preferences;
CREATE POLICY "own notif prefs" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Staff invites: tokens + expiry
ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS token text UNIQUE,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE public.staff_invites SET token = encode(gen_random_bytes(24), 'hex') WHERE token IS NULL;

ALTER TABLE public.staff_invites ALTER COLUMN token SET NOT NULL;
ALTER TABLE public.staff_invites ALTER COLUMN token SET DEFAULT encode(gen_random_bytes(24), 'hex');

DROP POLICY IF EXISTS "lookup invite by token" ON public.staff_invites;
CREATE POLICY "lookup invite by token" ON public.staff_invites
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "accept invite" ON public.staff_invites;
CREATE POLICY "accept invite" ON public.staff_invites
  FOR UPDATE USING (status = 'pending' AND expires_at > now())
  WITH CHECK (accepted_by = auth.uid());
