BEGIN;

SELECT plan(11);

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

SELECT * FROM finish();

ROLLBACK;
