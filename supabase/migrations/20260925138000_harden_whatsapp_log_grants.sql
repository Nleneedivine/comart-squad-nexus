-- WhatsApp message bodies and payloads are private integration data.
-- Keep anonymous clients from even having table-level SELECT capability.

REVOKE ALL ON TABLE public.whatsapp_message_logs FROM anon;
