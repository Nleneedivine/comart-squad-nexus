
CREATE TABLE public.admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES public.admin_messages(id) ON DELETE SET NULL,
  from_superadmin BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_messages TO authenticated;
GRANT ALL ON public.admin_messages TO service_role;

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage all admin messages"
  ON public.admin_messages FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = auth.uid()));

CREATE POLICY "Recipients read their messages"
  ON public.admin_messages FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipients reply to their messages"
  ON public.admin_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid() AND from_superadmin = false);

CREATE POLICY "Recipients mark their messages read"
  ON public.admin_messages FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE INDEX admin_messages_recipient_idx ON public.admin_messages(recipient_user_id, read_at);
CREATE INDEX admin_messages_store_idx ON public.admin_messages(store_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.mark_admin_message_read(_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admin_messages
  SET read_at = COALESCE(read_at, now())
  WHERE id = _id AND recipient_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.mark_admin_message_read(UUID) TO authenticated;
