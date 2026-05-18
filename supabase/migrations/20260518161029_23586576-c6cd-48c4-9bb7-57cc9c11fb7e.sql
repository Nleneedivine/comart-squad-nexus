
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_store_id UUID;
  is_admin_email BOOLEAN;
  inv RECORD;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  -- Check for a pending invite matching this email
  SELECT * INTO inv FROM public.staff_invites
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, store_id, role)
    VALUES (NEW.id, inv.store_id, inv.role)
    ON CONFLICT DO NOTHING;
    UPDATE public.staff_invites
      SET status = 'accepted', accepted_by = NEW.id, accepted_at = now()
      WHERE id = inv.id;
    RETURN NEW;
  END IF;

  -- Otherwise: tenant signup → create a store
  INSERT INTO public.stores (name, owner_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'store_name', 'My Store'), NEW.id)
  RETURNING id INTO new_store_id;

  INSERT INTO public.user_roles (user_id, store_id, role) VALUES (NEW.id, new_store_id, 'owner');

  is_admin_email := NEW.email = 'divinenlenee@gmail.com';
  IF is_admin_email THEN
    INSERT INTO public.user_roles (user_id, store_id, role) VALUES (NEW.id, new_store_id, 'admin');
  END IF;

  RETURN NEW;
END;
$function$;
