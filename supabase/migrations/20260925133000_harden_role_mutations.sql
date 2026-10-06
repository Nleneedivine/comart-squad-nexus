-- Direct browser role mutation is no longer part of the application contract.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.set_staff_role(
  _store_id UUID,
  _user_id UUID,
  _role public.app_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _role IN ('owner','admin') THEN
    RAISE EXCEPTION 'Cannot assign privileged role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND store_id = _store_id
  ) THEN
    RAISE EXCEPTION 'Staff member is not in this store';
  END IF;

  INSERT INTO public.user_roles(user_id, store_id, role)
  VALUES (_user_id, _store_id, _role)
  ON CONFLICT (user_id, store_id, role) DO NOTHING;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_role(UUID,UUID,public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_staff_role(
  _store_id UUID,
  _user_id UUID,
  _role public.app_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_privileged INTEGER;
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _role IN ('owner','admin') THEN
    RAISE EXCEPTION 'Cannot remove privileged role';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND store_id = _store_id AND role = _role;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_staff_role(UUID,UUID,public.app_role) TO authenticated;
