
CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  u_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO u_email FROM auth.users WHERE id = auth.uid();
  IF u_email IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;

  SELECT * INTO inv FROM public.staff_invites WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.status <> 'pending' OR inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already used';
  END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;
  IF lower(inv.email) <> lower(u_email) THEN
    RAISE EXCEPTION 'invite email mismatch';
  END IF;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (auth.uid(), inv.store_id, inv.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.staff_invites
    SET status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    WHERE id = inv.id;

  INSERT INTO public.activity_log(store_id, user_id, type, activity)
  VALUES (inv.store_id, auth.uid(), 'staff', u_email || ' joined as ' || inv.role::text);

  UPDATE public.profiles
    SET onboarding_completed = true, onboarding_step = 4
    WHERE id = auth.uid();

  RETURN jsonb_build_object('store_id', inv.store_id, 'role', inv.role);
END $$;

GRANT EXECUTE ON FUNCTION public.accept_staff_invite(text) TO authenticated;
