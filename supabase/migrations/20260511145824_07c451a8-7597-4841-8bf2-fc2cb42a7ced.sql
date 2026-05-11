-- Group chat
CREATE TABLE public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages ADD COLUMN group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE;
CREATE INDEX idx_chat_messages_group ON public.chat_messages(group_id) WHERE group_id IS NOT NULL;

-- Helper: is user member of group?
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_group_members WHERE user_id = _user_id AND group_id = _group_id);
$$;

CREATE POLICY "members view groups" ON public.chat_groups FOR SELECT
USING (is_store_member(auth.uid(), store_id));

CREATE POLICY "admins manage groups" ON public.chat_groups FOR ALL
USING (is_store_admin(auth.uid(), store_id) OR created_by = auth.uid())
WITH CHECK (is_store_admin(auth.uid(), store_id) OR created_by = auth.uid());

CREATE POLICY "members view group_members" ON public.chat_group_members FOR SELECT
USING (is_store_member(auth.uid(), store_id));

CREATE POLICY "admins manage group_members" ON public.chat_group_members FOR ALL
USING (
  is_store_admin(auth.uid(), store_id)
  OR EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
)
WITH CHECK (
  is_store_admin(auth.uid(), store_id)
  OR EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
);

-- Add group message visibility policy alongside existing chat_messages policies
DROP POLICY IF EXISTS "members view messages" ON public.chat_messages;
CREATE POLICY "members view messages" ON public.chat_messages FOR SELECT
USING (
  is_store_member(auth.uid(), store_id)
  AND (
    (group_id IS NULL AND (recipient_id IS NULL OR sender_id = auth.uid() OR recipient_id = auth.uid()))
    OR (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id))
  )
);

DROP POLICY IF EXISTS "members send messages" ON public.chat_messages;
CREATE POLICY "members send messages" ON public.chat_messages FOR INSERT
WITH CHECK (
  is_store_member(auth.uid(), store_id)
  AND sender_id = auth.uid()
  AND (group_id IS NULL OR is_group_member(auth.uid(), group_id))
);

-- Integration catalog (super admin maintained)
CREATE TABLE public.integration_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view catalog" ON public.integration_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "superadmins manage catalog" ON public.integration_catalog FOR ALL
USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TABLE public.store_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  integration_key text NOT NULL,
  status text NOT NULL DEFAULT 'locked',
  paystack_reference text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, integration_key)
);
ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view store_integrations" ON public.store_integrations FOR SELECT
USING (is_store_member(auth.uid(), store_id) OR is_superadmin(auth.uid()));
CREATE POLICY "members request store_integrations" ON public.store_integrations FOR INSERT
WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE POLICY "admins update store_integrations" ON public.store_integrations FOR UPDATE
USING (is_store_admin(auth.uid(), store_id) OR is_superadmin(auth.uid()));
CREATE POLICY "superadmins manage store_integrations" ON public.store_integrations FOR ALL
USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

-- Webhooks
ALTER TABLE public.stores ADD COLUMN webhook_secret text DEFAULT encode(extensions.gen_random_bytes(24), 'hex');

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'wp-forms',
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view webhook_deliveries" ON public.webhook_deliveries FOR SELECT
USING (is_store_admin(auth.uid(), store_id) OR is_superadmin(auth.uid()));

-- Index helper for round-robin
CREATE INDEX IF NOT EXISTS idx_orders_open_assignee ON public.orders(store_id, assigned_to)
WHERE is_archived = false AND status IN ('pending','processing','shipped');

-- Seed integration catalog with current items (idempotent)
INSERT INTO public.integration_catalog (key, name, description, monthly_price) VALUES
  ('auto_assign', 'Auto Assign Orders', 'Automatically distribute incoming orders to your sales agents.', 2500),
  ('online_store', 'Online Store', 'Launch a public storefront powered by your Comart+ catalog.', 5000),
  ('woocommerce', 'WooCommerce', 'Sync products, orders and inventory with your WooCommerce store.', 5000),
  ('paystack', 'Paystack', 'Accept secure payments and reconcile transactions automatically.', 3000),
  ('whatsapp_checkout', 'WhatsApp Checkout', 'Let customers complete purchases right inside WhatsApp.', 3500),
  ('chat_groups', 'Group Chat', 'Create internal team groups with shared messaging.', 2000),
  ('staff_management', 'Staff Management Pro', 'Advanced HR, performance and attendance tracking.', 4000),
  ('elementor_forms', 'Elementor Forms', 'Capture leads from your WordPress site straight into Comart+.', 2500),
  ('wp_forms', 'WP Forms Webhook', 'Receive order/lead submissions from WPForms via webhook.', 2500)
ON CONFLICT (key) DO NOTHING;