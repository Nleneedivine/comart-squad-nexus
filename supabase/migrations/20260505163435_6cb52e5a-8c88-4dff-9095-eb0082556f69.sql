
-- Superadmins table
CREATE TABLE public.superadmins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = _user_id);
$$;

CREATE POLICY "superadmins view superadmins" ON public.superadmins FOR SELECT USING (public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage superadmins" ON public.superadmins FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'starter',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  amount numeric NOT NULL DEFAULT 0,
  paystack_customer_code text,
  paystack_subscription_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view subscription" ON public.subscriptions FOR SELECT USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage subscriptions" ON public.subscriptions FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE TRIGGER subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Feature flags
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  flag_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, flag_key)
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view flags" ON public.feature_flags FOR SELECT USING (public.is_store_member(auth.uid(), store_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage flags" ON public.feature_flags FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Broadcasts
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view broadcasts" ON public.broadcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "superadmins write broadcasts" ON public.broadcasts FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Platform audit log
CREATE TABLE public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmins view audit" ON public.platform_audit_log FOR SELECT USING (public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins insert audit" ON public.platform_audit_log FOR INSERT WITH CHECK (public.is_superadmin(auth.uid()) AND actor_id = auth.uid());

-- Auto-create trialing subscription on new store
CREATE OR REPLACE FUNCTION public.tg_new_store_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (store_id, plan, status, trial_ends_at)
  VALUES (NEW.id, 'starter', 'trialing', now() + interval '14 days')
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER stores_create_subscription AFTER INSERT ON public.stores FOR EACH ROW EXECUTE FUNCTION public.tg_new_store_subscription();

-- Backfill existing stores
INSERT INTO public.subscriptions (store_id, plan, status, trial_ends_at)
SELECT id, 'starter', 'trialing', now() + interval '14 days' FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

-- Seed superadmin for known admin email
INSERT INTO public.superadmins (user_id)
SELECT id FROM auth.users WHERE email = 'divinenlenee@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
