import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";

type StoreInfo = { id: string; name: string };

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  hydrated: boolean;
  store: StoreInfo | null;
  roles: string[];
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, loading: true, hydrated: false, store: null, roles: [], refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  const loadStoreAndRoles = async (uid: string, settleLoading = false) => {
    try {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role, store_id, stores(id, name)")
        .eq("user_id", uid);
      if (roleRows && roleRows.length > 0) {
        const first = roleRows[0] as any;
        const storeInfo = first.stores ? { id: first.stores.id, name: first.stores.name } : null;
        const roleList = roleRows.map((r: any) => r.role);
        setStore(storeInfo);
        setRoles(roleList);
        setSentryUser({ userId: uid, storeId: storeInfo?.id, role: roleList[0] });
      } else {
        setStore(null);
        setRoles([]);
        setSentryUser({ userId: uid });
      }
    } finally {
      if (settleLoading) setLoading(false);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setHydrated(true);
      if (s?.user) {
        setTimeout(() => { void loadStoreAndRoles(s.user.id); }, 0);
      } else {
        setStore(null); setRoles([]);
        clearSentryUser();
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadStoreAndRoles(data.session.user.id, true).finally(() => setHydrated(true));
      } else {
        setLoading(false);
        setHydrated(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadStoreAndRoles(session.user.id);
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, hydrated, store, roles, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  sales_rep: "Sales Rep",
  manager: "Manager",
  hr: "HR",
  inventory_manager: "Inventory Manager",
  marketer: "Marketer",
  order_manager: "Order Manager",
  customer_care: "Customer Care",
  logistics_manager: "Logistics Manager",
  accountant: "Accountant",
  head_of_operations: "Head Of Operations",
};
