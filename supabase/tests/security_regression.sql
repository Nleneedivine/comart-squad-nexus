BEGIN;

SELECT plan(22);

-- These are catalog-level regression checks and do not require production data.
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.wallets', 'UPDATE'),
  'authenticated cannot directly UPDATE wallets'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT'),
  'authenticated cannot directly INSERT wallet transactions'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.wallet_transactions', 'UPDATE'),
  'authenticated cannot directly UPDATE wallet transactions'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_roles', 'UPDATE'),
  'authenticated cannot directly UPDATE user roles'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_roles', 'INSERT'),
  'authenticated cannot directly INSERT user roles'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.whatsapp_integrations', 'SELECT'),
  'authenticated cannot directly SELECT WhatsApp credential rows'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.staff_invites', 'SELECT'),
  'authenticated cannot directly SELECT invitation tokens'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.set_wallet_pin(uuid,text)',
    'EXECUTE'
  ),
  'authenticated can execute the permission-checked wallet PIN RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.complete_wallet_funding(uuid,text,numeric,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute internal wallet funding completion'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.accept_staff_invite(text)',
    'EXECUTE'
  ),
  'authenticated can execute the email-bound invite acceptance RPC'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_invite_by_token(text)',
    'EXECUTE'
  ),
  'anonymous invite lookup is available without table-wide invite SELECT'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='finance_records' AND policyname='finance managers can insert finance'),
  'finance inserts require finance.manage'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='inventory managers can insert products'),
  'product inserts require inventory.manage'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='call_orders' AND policyname='order managers can update call orders'),
  'call-order updates require orders.manage'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff_invites' AND policyname='lookup invite by token'),
  'global invite lookup policy is removed'
);


SELECT ok(
  NOT has_table_privilege('anon', 'public.customers', 'SELECT'),
  'anonymous users cannot directly read customer data'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customers' AND policyname='customers view by permission'),
  'customer reads require customers.view'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='purchase_orders' AND policyname='purchase orders insert by permission'),
  'purchase-order writes require inventory.manage'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='waybills' AND policyname='waybills insert by permission'),
  'waybill writes require logistics.manage'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.receive_purchase_order_items(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated can reach the permission-checked stock receiving RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.receive_purchase_order_items(uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute stock receiving RPC'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='form_submissions' AND policyname='public submit active form'),
  'public form submissions must reference an active form in the same store'
);

SELECT * FROM finish();

ROLLBACK;
