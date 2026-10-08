BEGIN;

-- Browser sessions do not need DDL-adjacent table privileges. In particular,
-- TRUNCATE bypasses RLS, so leaving it granted would allow a signed-in role
-- to erase an entire tenant table despite otherwise-correct row policies.
REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES
  FROM anon, authenticated;

-- Integration state must never be destructively modified by browser sessions.
REVOKE DELETE
  ON TABLE public.store_integrations
  FROM anon, authenticated;

-- settings is server-only because future integration credentials may live in it.
REVOKE ALL PRIVILEGES
  ON COLUMN public.store_integrations.settings
  FROM anon, authenticated;

COMMENT ON COLUMN public.store_integrations.settings IS
  'Server-only integration configuration. Never expose directly to anon/authenticated clients; use server-side integration helpers for approved non-secret fields.';

COMMIT;
