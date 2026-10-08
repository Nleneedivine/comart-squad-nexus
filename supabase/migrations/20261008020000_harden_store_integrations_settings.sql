BEGIN;

-- Browser sessions must never be able to delete, truncate, alter triggers,
-- or create foreign-key references against integration state. RLS does not
-- protect TRUNCATE, so table-level TRUNCATE is especially dangerous here.
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.store_integrations
  FROM anon, authenticated;

-- settings is server-only because future integration credentials may live in it.
REVOKE ALL PRIVILEGES
  ON COLUMN public.store_integrations.settings
  FROM anon, authenticated;

COMMENT ON COLUMN public.store_integrations.settings IS
  'Server-only integration configuration. Never expose directly to anon/authenticated clients; use server-side integration helpers for approved non-secret fields.';

COMMIT;
