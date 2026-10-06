BEGIN;

SELECT plan(29);

-- Two independent authenticated users. The signup trigger creates one store
-- and one owner role for each user. All fixture data is rolled back at the end.
INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rls-user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'rls-user-b@example.test');

CREATE TEMP TABLE security_ctx AS
SELECT
  '11111111-1111-1111-1111-111111111111'::uuid AS user_a,
  '22222222-2222-2222-2222-222222222222'::uuid AS user_b,
  (SELECT id FROM public.stores WHERE owner_id = '11111111-1111-1111-1111-111111111111'::uuid) AS store_a,
  (SELECT id FROM public.stores WHERE owner_id = '22222222-2222-2222-2222-222222222222'::uuid) AS store_b;

INSERT INTO public.customers (store_id, name, phone)
SELECT store_a, 'Store A Customer', '08000000001' FROM security_ctx
UNION ALL
SELECT store_b, 'Store B Customer', '08000000002' FROM security_ctx;

INSERT INTO public.orders (store_id, customer_name, amount, units, created_by)
SELECT store_a, 'Store A Customer', 1000, 1, user_a FROM security_ctx
UNION ALL
SELECT store_b, 'Store B Customer', 2000, 2, user_b FROM security_ctx;

INSERT INTO public.products (store_id, name, selling_price, buying_price)
SELECT store_a, 'Store A Product', 1000, 700 FROM security_ctx
UNION ALL
SELECT store_b, 'Store B Product', 2000, 1400 FROM security_ctx;

INSERT INTO public.finance_records (store_id, type, amount, description, created_by)
SELECT store_a, 'income'::public.finance_type, 1000, 'Store A Finance', user_a FROM security_ctx
UNION ALL
SELECT store_b, 'income'::public.finance_type, 2000, 'Store B Finance', user_b FROM security_ctx;

INSERT INTO public.wallets (store_id, balance)
SELECT store_a, 10000 FROM security_ctx
UNION ALL
SELECT store_b, 20000 FROM security_ctx;

-- pgTAP executes assertion SQL under the current role, so allow the
-- authenticated test role to read this transaction-local fixture context.
GRANT SELECT ON security_ctx TO authenticated;

-- RLS must execute as the same Postgres roles used by Supabase API requests.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}';

SELECT results_eq(
  'SELECT count(*) FROM public.stores',
  ARRAY[1::bigint],
  'user A sees only store A'
);

SELECT results_eq(
  'SELECT count(*) FROM public.user_roles',
  ARRAY[1::bigint],
  'user A sees only store A roles'
);

SELECT results_eq(
  'SELECT count(*) FROM public.customers',
  ARRAY[1::bigint],
  'user A sees only store A customers'
);

SELECT results_eq(
  'SELECT count(*) FROM public.orders',
  ARRAY[1::bigint],
  'user A sees only store A orders'
);

SELECT results_eq(
  'SELECT count(*) FROM public.products',
  ARRAY[1::bigint],
  'user A sees only store A products'
);

SELECT results_eq(
  'SELECT count(*) FROM public.finance_records',
  ARRAY[1::bigint],
  'user A sees only store A finance'
);

SELECT results_eq(
  'SELECT count(*) FROM public.wallets',
  ARRAY[1::bigint],
  'user A sees only store A wallet'
);

SELECT results_eq(
  'SELECT count(*) FROM public.user_store_preferences',
  ARRAY[1::bigint],
  'user A sees only their own active-store preference'
);

SELECT results_eq(
  $$SELECT count(*) FROM public.customers WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY[0::bigint],
  'user A cannot filter into store B customers'
);

SELECT results_eq(
  $$SELECT count(*) FROM public.orders WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY[0::bigint],
  'user A cannot filter into store B orders'
);

SELECT results_eq(
  $$SELECT count(*) FROM public.products WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY[0::bigint],
  'user A cannot filter into store B products'
);

SELECT results_eq(
  $$SELECT count(*) FROM public.finance_records WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY[0::bigint],
  'user A cannot filter into store B finance'
);

SELECT throws_ok(
  $$INSERT INTO public.customers (store_id, name, phone)
    VALUES ((SELECT store_b FROM security_ctx), 'Cross Store Customer', '08000000003')$$,
  '42501',
  NULL,
  'user A cannot insert a customer into store B'
);

SELECT is_empty(
  $$UPDATE public.customers
    SET name = 'Cross Store Update'
    WHERE store_id = (SELECT store_b FROM security_ctx)
    RETURNING id$$,
  'user A cannot update store B customers'
);

SET LOCAL ROLE postgres;
SELECT results_eq(
  $$SELECT name FROM public.customers
    WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY['Store B Customer'::text],
  'store B customer remains unchanged after denied update'
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.orders (store_id, customer_name, amount, units, created_by)
    VALUES ((SELECT store_b FROM security_ctx), 'Cross Store Order', 9999, 1, (SELECT user_a FROM security_ctx))$$,
  '42501',
  NULL,
  'user A cannot insert an order into store B'
);

SELECT throws_ok(
  $$INSERT INTO public.products (store_id, name, selling_price, buying_price)
    VALUES ((SELECT store_b FROM security_ctx), 'Cross Store Product', 9999, 5000)$$,
  '42501',
  NULL,
  'user A cannot insert a product into store B'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_records (store_id, type, amount, description, created_by)
    VALUES ((SELECT store_b FROM security_ctx), 'income'::public.finance_type, 9999, 'Cross Store Finance', (SELECT user_a FROM security_ctx))$$,
  '42501',
  NULL,
  'user A cannot insert finance into store B'
);

SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, store_id, role)
    VALUES ((SELECT user_a FROM security_ctx), (SELECT store_b FROM security_ctx), 'sales_rep')$$,
  '42501',
  NULL,
  'user A cannot directly create a role in store B'
);

SELECT is_empty(
  $$UPDATE public.orders
    SET amount = 999999
    WHERE store_id = (SELECT store_b FROM security_ctx)
    RETURNING id$$,
  'user A cannot update store B orders'
);

SET LOCAL ROLE postgres;
SELECT results_eq(
  $$SELECT amount FROM public.orders
    WHERE store_id = (SELECT store_b FROM security_ctx)$$,
  ARRAY[2000::numeric],
  'store B order remains unchanged after denied update'
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$SELECT public.has_permission(
      (SELECT user_a FROM security_ctx),
      (SELECT store_a FROM security_ctx),
      'customers.view'
    )$$,
  ARRAY[true],
  'user A has customers.view in store A'
);

SELECT results_eq(
  $$SELECT public.has_permission(
      (SELECT user_a FROM security_ctx),
      (SELECT store_b FROM security_ctx),
      'customers.view'
    )$$,
  ARRAY[false],
  'user A does not have customers.view in store B'
);

SELECT results_eq(
  $$SELECT public.has_permission(
      (SELECT user_b FROM security_ctx),
      (SELECT store_a FROM security_ctx),
      'customers.view'
    )$$,
  ARRAY[false],
  'user A cannot spoof user B through has_permission'
);

SELECT throws_ok(
  $$UPDATE public.user_store_preferences
    SET active_store_id = (SELECT store_b FROM security_ctx)
    WHERE user_id = (SELECT user_a FROM security_ctx)$$,
  '42501',
  NULL,
  'user A cannot switch their preference to store B'
);

SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}';

SELECT results_eq(
  'SELECT count(*) FROM public.customers',
  ARRAY[1::bigint],
  'user B sees only store B customers'
);

SELECT is_empty(
  $$UPDATE public.customers
    SET name = 'User B Cross Store Update'
    WHERE store_id = (SELECT store_a FROM security_ctx)
    RETURNING id$$,
  'user B cannot update store A customers'
);

SET LOCAL ROLE postgres;
SELECT results_eq(
  $$SELECT name FROM public.customers
    WHERE store_id = (SELECT store_a FROM security_ctx)$$,
  ARRAY['Store A Customer'::text],
  'store A customer remains unchanged after user B denied update'
);
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$DELETE FROM public.orders
    WHERE store_id = (SELECT store_a FROM security_ctx)
    RETURNING id$$,
  'user B cannot delete store A orders'
);

SELECT * FROM finish();

ROLLBACK;
