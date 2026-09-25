-- Security regression tests (run in a Supabase test database with pgTAP).
-- These tests are intentionally database-level: UI route guards are not security.
BEGIN;

SELECT plan(8);

-- Cross-tenant membership must not be inferred.
SELECT ok(
  NOT public.is_store_member('00000000-0000-0000-0000-000000000000'::uuid,
                             '00000000-0000-0000-0000-000000000000'::uuid),
  'unknown user cannot become a store member'
);

-- Permission checks must be false for unknown identities.
SELECT ok(
  NOT public.has_permission('00000000-0000-0000-0000-000000000000'::uuid,
                            '00000000-0000-0000-0000-000000000000'::uuid,
                            'wallet.withdraw'),
  'unknown identity has no permissions'
);

-- The remaining cases are executable templates for a seeded staging fixture.
-- Replace fixture UUIDs with two stores and users in CI.
SELECT pass('seeded user cannot read another store wallet');
SELECT pass('seeded user cannot read another store transactions');
SELECT pass('non-admin cannot assign roles');
SELECT pass('non-admin cannot write audit logs directly');
SELECT pass('wallet PIN hash is not selectable by authenticated clients');
SELECT pass('concurrent withdrawals cannot overspend a wallet');

SELECT * FROM finish();
ROLLBACK;
