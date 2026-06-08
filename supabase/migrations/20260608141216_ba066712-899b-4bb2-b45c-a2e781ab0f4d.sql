
-- 1. RPC: enriched store members for store admins
CREATE OR REPLACE FUNCTION public.get_store_members_detail(_store_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  roles text[],
  role_ids uuid[],
  is_suspended boolean,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_store_admin(auth.uid(), _store_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    ur.user_id,
    p.full_name,
    p.email,
    p.phone,
    array_agg(ur.role::text ORDER BY ur.role::text) AS roles,
    array_agg(ur.id) AS role_ids,
    bool_or(ur.is_suspended) AS is_suspended,
    min(ur.created_at) AS joined_at,
    u.last_sign_in_at,
    CASE
      WHEN bool_or(ur.is_suspended) THEN 'Inactive'
      WHEN u.last_sign_in_at IS NULL THEN 'Pending'
      ELSE 'Active'
    END AS status
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.store_id = _store_id
  GROUP BY ur.user_id, p.full_name, p.email, p.phone, u.last_sign_in_at;
END $$;

GRANT EXECUTE ON FUNCTION public.get_store_members_detail(uuid) TO authenticated;

-- 2. RPC: enriched tenants list for superadmins
CREATE OR REPLACE FUNCTION public.superadmin_list_tenants()
RETURNS TABLE(
  id uuid,
  name text,
  owner_id uuid,
  owner_email text,
  owner_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz,
  status text,
  suspended_at timestamptz,
  staff_count integer,
  plan text,
  sub_status text,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    s.id, s.name, s.owner_id,
    u.email::text AS owner_email,
    p.full_name AS owner_name,
    s.contact_email, s.contact_phone,
    s.created_at,
    s.status::text AS status,
    s.suspended_at,
    (SELECT count(DISTINCT ur.user_id)::int FROM public.user_roles ur WHERE ur.store_id = s.id) AS staff_count,
    sub.plan, sub.status::text AS sub_status, sub.trial_ends_at
  FROM public.stores s
  LEFT JOIN auth.users u ON u.id = s.owner_id
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.subscriptions sub ON sub.store_id = s.id
  ORDER BY s.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.superadmin_list_tenants() TO authenticated;
