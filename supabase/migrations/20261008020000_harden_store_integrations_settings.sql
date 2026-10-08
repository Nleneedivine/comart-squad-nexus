-- Harden store_integrations.settings so browser sessions cannot read or mutate
-- the raw JSON blob. It may contain integration credentials in future.
-- Legitimate field-mapping access is handled by server-only functions.
BEGIN;

REVOKE ALL PRIVILEGES
  ON COLUMN public.store_integrations.settings
  FROM anon, authenticated;

COMMENT ON COLUMN public.store_integrations.settings IS
  'Server-only integration configuration. Never expose directly to anon/authenticated clients; use server-side integration helpers for approved non-secret fields.';

COMMIT;
