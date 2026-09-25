-- Harden multi-store session state by making the active store explicit.
-- The frontend must never infer the active tenant from row ordering.

CREATE TABLE IF NOT EXISTS public.user_store_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_store_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users view own store preference" ON public.user_store_preferences;
CREATE POLICY "users view own store preference"
  ON public.user_store_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own store preference" ON public.user_store_preferences;
CREATE POLICY "users insert own store preference"
  ON public.user_store_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_store_member(auth.uid(), active_store_id)
  );

DROP POLICY IF EXISTS "users update own store preference" ON public.user_store_preferences;
CREATE POLICY "users update own store preference"
  ON public.user_store_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_store_member(auth.uid(), active_store_id)
  );

CREATE INDEX IF NOT EXISTS idx_user_store_preferences_active_store
  ON public.user_store_preferences(active_store_id);

CREATE OR REPLACE FUNCTION public.set_default_active_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_store_preferences (user_id, active_store_id)
  VALUES (NEW.user_id, NEW.store_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_set_default_active_store ON public.user_roles;
CREATE TRIGGER user_roles_set_default_active_store
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_active_store();

-- Backfill existing users deterministically once, without changing an existing preference.
INSERT INTO public.user_store_preferences (user_id, active_store_id)
SELECT ur.user_id, MIN(ur.store_id)
FROM public.user_roles ur
GROUP BY ur.user_id
ON CONFLICT (user_id) DO NOTHING;

-- Remove the legacy email-based privilege escalation. Super-admin status must
-- be managed explicitly, not inferred from an email address in a signup trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_store_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.stores (name, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'store_name', 'My Store'), NEW.id)
  RETURNING id INTO new_store_id;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (NEW.id, new_store_id, 'owner');

  RETURN NEW;
END;
$$;
