
CREATE POLICY "superadmins view all stores" ON public.stores FOR SELECT USING (public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins view all profiles" ON public.profiles FOR SELECT USING (public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins view all orders" ON public.orders FOR SELECT USING (public.is_superadmin(auth.uid()));
CREATE POLICY "superadmins view all user_roles" ON public.user_roles FOR SELECT USING (public.is_superadmin(auth.uid()));
