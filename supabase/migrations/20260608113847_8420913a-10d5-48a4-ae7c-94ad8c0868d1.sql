
CREATE OR REPLACE FUNCTION public.superadmin_delete_store(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_roles WHERE store_id = _store_id;
  DELETE FROM public.staff_invites WHERE store_id = _store_id;
  INSERT INTO public.platform_audit_log(actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'store.delete', 'store', _store_id, jsonb_build_object('at', now()));
  DELETE FROM public.stores WHERE id = _store_id;
END $function$;

CREATE OR REPLACE FUNCTION public.close_my_store(_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = _store_id;
  IF s IS NULL THEN RAISE EXCEPTION 'store not found'; END IF;
  IF s.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden: only the store owner can close the store';
  END IF;
  DELETE FROM public.user_roles WHERE store_id = _store_id;
  DELETE FROM public.staff_invites WHERE store_id = _store_id;
  INSERT INTO public.platform_audit_log(actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'store.close', 'store', _store_id, jsonb_build_object('at', now(), 'by_owner', true));
  DELETE FROM public.stores WHERE id = _store_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.close_my_store(uuid) TO authenticated;
