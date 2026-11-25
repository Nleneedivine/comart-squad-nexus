CREATE OR REPLACE FUNCTION public.staff_remove_member(_store_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_can_manage_member(_store_id, _user_id);

  UPDATE public.orders
  SET assigned_to = NULL, assigned_at = NULL
  WHERE store_id = _store_id AND assigned_to = _user_id;

  UPDATE public.call_orders
  SET agent_user_id = NULL, agent_name = NULL
  WHERE store_id = _store_id AND agent_user_id = _user_id;

  DELETE FROM public.user_roles
  WHERE store_id = _store_id AND user_id = _user_id;

  UPDATE public.profiles
  SET active_store_id = NULL
  WHERE id = _user_id AND active_store_id = _store_id;
END
$function$;