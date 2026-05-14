
-- PHASE 1: TENANT ISOLATION HARDENING

-- 1. Store lifecycle status (active/suspended/deleted) — single source of truth
DO $$ BEGIN
  CREATE TYPE public.store_status AS ENUM ('active','suspended','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS status public.store_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Strengthen membership helpers: revoke access for suspended/deleted stores
CREATE OR REPLACE FUNCTION public.is_store_member(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id
      AND s.status = 'active'
      AND (
        s.owner_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.store_id = _store_id
            AND COALESCE(ur.is_suspended, false) = false
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_store_admin(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id
      AND s.status = 'active'
      AND (
        s.owner_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.store_id = _store_id
            AND ur.role IN ('owner','admin','manager','head_of_operations')
            AND COALESCE(ur.is_suspended, false) = false
        )
      )
  );
$$;

-- 3. Storage path-prefix isolation for tenant buckets
-- Avatars: {user_id}/...   Logos: {store_id}/...
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
DROP POLICY IF EXISTS "avatars write own" ON storage.objects;
DROP POLICY IF EXISTS "avatars update own" ON storage.objects;
DROP POLICY IF EXISTS "avatars delete own" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars write own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars update own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars delete own" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "store-logos read" ON storage.objects;
DROP POLICY IF EXISTS "store-logos write admin" ON storage.objects;
DROP POLICY IF EXISTS "store-logos update admin" ON storage.objects;
DROP POLICY IF EXISTS "store-logos delete admin" ON storage.objects;
CREATE POLICY "store-logos read" ON storage.objects FOR SELECT
  USING (bucket_id = 'store-logos');
CREATE POLICY "store-logos write admin" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'store-logos'
    AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "store-logos update admin" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'store-logos'
    AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "store-logos delete admin" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'store-logos'
    AND public.is_store_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 4. Webhook secret hardening — only admins can read stores.webhook_secret
-- (RLS on stores already gates row visibility to members; we additionally
--  expose a SECURITY DEFINER getter that admins use, so we can revoke direct
--  column access from non-admins in app code.)
CREATE OR REPLACE FUNCTION public.get_store_webhook_secret(_store_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.webhook_secret FROM public.stores s
  WHERE s.id = _store_id
    AND public.is_store_admin(auth.uid(), _store_id);
$$;

-- 5. Diagnostic: superadmin-only cross-tenant isolation probe
CREATE OR REPLACE FUNCTION public.isolation_probe(_actor uuid, _foreign_store uuid)
RETURNS TABLE(table_name text, leaked_rows bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Counts rows in the foreign store that the actor's RLS would expose.
  -- Run on a representative subset; expand as needed.
  RETURN QUERY
    SELECT 'orders'::text, count(*)::bigint FROM public.orders WHERE store_id = _foreign_store
      AND public.is_store_member(_actor, store_id)
    UNION ALL SELECT 'customers', count(*) FROM public.customers WHERE store_id = _foreign_store
      AND public.is_store_member(_actor, store_id)
    UNION ALL SELECT 'products', count(*) FROM public.products WHERE store_id = _foreign_store
      AND public.is_store_member(_actor, store_id)
    UNION ALL SELECT 'chat_messages', count(*) FROM public.chat_messages WHERE store_id = _foreign_store
      AND public.is_store_member(_actor, store_id)
    UNION ALL SELECT 'finance_records', count(*) FROM public.finance_records WHERE store_id = _foreign_store
      AND public.is_store_member(_actor, store_id);
END $$;

-- 6. Performance indexes (also part of Phase 6, but cheap to ship now to
--    benefit policy lookups)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_store ON public.user_roles(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created ON public.orders(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_assigned ON public.orders(store_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_customers_store_phone ON public.customers(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_chat_messages_store_group_created ON public.chat_messages(store_id, group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at);
