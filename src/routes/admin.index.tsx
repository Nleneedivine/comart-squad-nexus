import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, CreditCard, ShoppingCart, Users } from "lucide-react";
import { formatNaira } from "@/lib/format";
import SuperAdminChat from "@/components/admin/SuperAdminChat";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const [stats, setStats] = useState({ stores: 0, users: 0, orders: 0, mrr: 0, trialing: 0, active: 0, past_due: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [stores, users, orders, subs] = await Promise.all([
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("status,amount,billing_cycle"),
      ]);
      const subRows = subs.data ?? [];
      const mrr = subRows.filter(s => s.status === "active").reduce((sum, s: any) => {
        const a = Number(s.amount) || 0;
        return sum + (s.billing_cycle === "annual" ? a / 12 : a);
      }, 0);
      setStats({
        stores: stores.count ?? 0,
        users: users.count ?? 0,
        orders: orders.count ?? 0,
        mrr,
        trialing: subRows.filter(s => s.status === "trialing").length,
        active: subRows.filter(s => s.status === "active").length,
        past_due: subRows.filter(s => s.status === "past_due").length,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "Tenants", value: stats.stores, icon: Building2 },
    { label: "Total Users", value: stats.users, icon: Users },
    { label: "Total Orders", value: stats.orders, icon: ShoppingCart },
    { label: "MRR", value: formatNaira(stats.mrr), icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">All tenants across Comart+</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase">{c.label}</div>
                <div className="mt-1 text-2xl font-bold">{loading ? "…" : c.value}</div>
              </div>
              <c.icon className="h-6 w-6 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Subscription health</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><div className="text-2xl font-bold text-blue-600">{stats.trialing}</div><div className="text-xs text-muted-foreground">Trialing</div></div>
          <div><div className="text-2xl font-bold text-green-600">{stats.active}</div><div className="text-xs text-muted-foreground">Active</div></div>
          <div><div className="text-2xl font-bold text-red-600">{stats.past_due}</div><div className="text-xs text-muted-foreground">Past due</div></div>
        </div>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">AI Assistant</h2>
        <SuperAdminChat />
      </div>
    </div>
  );
}
