-- Harden staff management and invitation isolation.

-- Invitations must never be globally readable. The acceptance page uses the
-- narrow get_invite_by_token RPC instead.
DROP POLICY IF EXISTS "lookup invite by token" ON public.staff_invites;
DROP POLICY IF EXISTS "admins view invites" ON public.staff_invites;
DROP POLICY IF EXISTS "admins manage invites" ON public.staff_invites;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_invites FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token TEXT)
RETURNS TABLE(
  email TEXT,
  role public.app_role,
  store_id UUID,
  store_name TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, i.role, i.store_id, s.name, i.status, i.expires_at, i.accepted_at
  FROM public.staff_invites i
  JOIN public.stores s ON s.id = i.store_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_store_invites(_store_id UUID)
RETURNS TABLE(
  id UUID,
  email TEXT,
  role public.app_role,
  token TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $store_invites$
  SELECT i.id, i.email, i.role, i.token, i.status, i.expires_at, i.created_at  FROM public.staff_invites i
  WHERE i.store_id = _store_id
    AND i.status = 'pending'
    AND public.has_permission(auth.uid(), _store_id, 'staff.manage')
  ORDER BY i.created_at DESC;
$store_invites$;

GRANT EXECUTE ON FUNCTION public.get_store_invites(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_staff(
  _store_id UUID,
  _email TEXT,
  _role public.app_role,
  _expires_at TIMESTAMPTZ
)
RETURNS TABLE(id UUID, token TEXT, email TEXT, role public.app_role, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(_email));
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _role IN ('owner','admin') THEN
    RAISE EXCEPTION 'Cannot invite privileged role';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF _expires_at <= now() OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Invalid expiration';
  END IF;

  RETURN QUERY
  INSERT INTO public.staff_invites(store_id,email,role,invited_by,expires_at)
  VALUES (_store_id,v_email,_role,auth.uid(),_expires_at)
  RETURNING staff_invites.id, staff_invites.token, staff_invites.email,
            staff_invites.role, staff_invites.expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_staff(UUID,TEXT,public.app_role,TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_staff_invite(_store_id UUID, _invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), _store_id, 'staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.staff_invites
  SET status = 'revoked'
  WHERE id = _invite_id AND store_id = _store_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_staff_invite(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_staff_member(
  _store_id UUID,
  _user_id UUID,
  _suspended BOOLEAN
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
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = _store_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND store_id = _store_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot suspend store owner';
  END IF;

  UPDATE public.user_roles
  SET is_suspended = _suspended
  WHERE user_id = _user_id AND store_id = _store_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suspend_staff_member(UUID,UUID,BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.get_store_members_detail(UUID);

CREATE OR REPLACE FUNCTION public.get_store_members_detail(_store_id UUID)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  roles public.app_role[],
  role_ids UUID[],
  is_suspended BOOLEAN,
  joined_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.phone,
    array_agg(ur.role ORDER BY ur.role) AS roles,
    array_agg(ur.id ORDER BY ur.role) AS role_ids,
    bool_or(coalesce(ur.is_suspended,false)) AS is_suspended,
    min(ur.created_at),
    au.last_sign_in_at,
    CASE
      WHEN bool_or(coalesce(ur.is_suspended,false)) THEN 'Inactive'
      ELSE 'Active'
    END
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN auth.users au ON au.id = ur.user_id
  WHERE ur.store_id = _store_id
    AND public.has_permission(auth.uid(), _store_id, 'staff.view')
  GROUP BY p.id, p.full_name, p.email, p.phone, au.last_sign_in_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_members_detail(UUID) TO authenticated;

-- Invitation acceptance is atomic and bound to the authenticated user's email.
DROP FUNCTION IF EXISTS public.accept_staff_invite(TEXT);

CREATE OR REPLACE FUNCTION public.accept_staff_invite(_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.staff_invites%ROWTYPE;
  account_email TEXT;
BEGIN
  SELECT email INTO account_email
  FROM auth.users
  WHERE id = auth.uid();

  SELECT * INTO inv
  FROM public.staff_invites
  WHERE token = _token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid, expired, or already used';
  END IF;
  IF lower(account_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'Invitation email does not match signed-in account';
  END IF;

  INSERT INTO public.user_roles(user_id,store_id,role)
  VALUES(auth.uid(),inv.store_id,inv.role)
  ON CONFLICT (user_id,store_id,role)
  DO UPDATE SET is_suspended = false;

  UPDATE public.staff_invites
  SET status='accepted', accepted_by=auth.uid(), accepted_at=now()
  WHERE id=inv.id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_staff_invite(TEXT) TO authenticated;

-- New users accepting an invitation must not also receive an unrelated empty
-- personal store from the generic signup trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_store_id UUID;
  pending_invite BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  SELECT EXISTS (
    SELECT 1 FROM public.staff_invites
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
  ) INTO pending_invite;

  IF pending_invite THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stores (name, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'store_name', 'My Store'), NEW.id)
  RETURNING id INTO new_store_id;

  INSERT INTO public.user_roles (user_id, store_id, role)
  VALUES (NEW.id, new_store_id, 'owner');

  RETURN NEW;
END;
$$;
