
-- Enums
CREATE TYPE public.app_role AS ENUM (
  'admin','owner','sales_rep','manager','hr','inventory_manager','marketer',
  'order_manager','customer_care','logistics_manager','accountant','head_of_operations'
);

CREATE TYPE public.order_status AS ENUM ('pending','processing','delivered','cancelled');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  community_name TEXT,
  avatar_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (per store)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id, role)
);

-- Staff invites
CREATE TABLE public.staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders (minimal for dashboard)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security definer helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _store_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND store_id=_store_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND store_id=_store_id)
      OR EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND owner_id=_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_store_admin(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id=_store_id AND owner_id=_user_id)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND store_id=_store_id AND role IN ('owner','admin','manager','head_of_operations'));
$$;

-- Auto-create profile + store on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_store_id UUID;
  is_admin_email BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

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
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "view store member profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur1 JOIN public.user_roles ur2 ON ur1.store_id=ur2.store_id WHERE ur1.user_id=auth.uid() AND ur2.user_id=profiles.id)
);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Stores policies
CREATE POLICY "members view store" ON public.stores FOR SELECT USING (public.is_store_member(auth.uid(), id));
CREATE POLICY "owner updates store" ON public.stores FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "owner inserts store" ON public.stores FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- User_roles policies
CREATE POLICY "members view roles" ON public.user_roles FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- Staff invites
CREATE POLICY "admins view invites" ON public.staff_invites FOR SELECT USING (public.is_store_admin(auth.uid(), store_id));
CREATE POLICY "admins manage invites" ON public.staff_invites FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- Attendance
CREATE POLICY "view own attendance" ON public.attendance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins view attendance" ON public.attendance FOR SELECT USING (public.is_store_admin(auth.uid(), store_id));
CREATE POLICY "insert own attendance" ON public.attendance FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_store_member(auth.uid(), store_id));
CREATE POLICY "update own attendance" ON public.attendance FOR UPDATE USING (auth.uid() = user_id);

-- Orders
CREATE POLICY "members view orders" ON public.orders FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert orders" ON public.orders FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage orders" ON public.orders FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
