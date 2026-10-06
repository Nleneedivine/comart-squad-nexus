-- Keep WhatsApp credentials server-only.
-- Store members must not be able to read or mutate integration credential rows
-- through the Supabase Data API. Server functions use service_role after authz.

REVOKE ALL ON TABLE public.whatsapp_integrations FROM anon, authenticated;

-- Revoke the existing broad grants/policies created by the original migration.
DROP POLICY IF EXISTS "wa_int_read" ON public.whatsapp_integrations;
DROP POLICY IF EXISTS "wa_int_write" ON public.whatsapp_integrations;

-- The server-side functions use service_role, which retains access.
