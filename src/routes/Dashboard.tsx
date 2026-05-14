import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MyPerformanceCard from "@/components/MyPerformanceCard";
import StaffPerformanceCard from "@/components/StaffPerformanceCard";
import LowStockCard from "@/components/LowStockCard";

import { SentryErrorBoundary, captureError } from "@/lib/sentry";

export const Route = createFileRoute("/Dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Comart+" }, { name: "description", content: "Comart+ store dashboard: revenue, orders and performance in ₦." }] }),
  component: () => (
    <ProtectedShell>
      <SentryErrorBoundary
        onError={(error) => captureError(error, { tags: { area: "dashboard" } })}
        fallback={({ resetError }) => (
          <div className="p-8 text-center space-y-3">
            <h2 className="text-lg font-semibold">Dashboard failed to render</h2>
            <p className="text-sm text-muted-foreground">We couldn't load this section. Try again or refresh.</p>
            <button onClick={resetError} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Retry</button>
          </div>
        )}
      >
        <Dashboard />
      </SentryErrorBoundary>
    </ProtectedShell>
  ),
});

const RANGES = ["Today", "Week", "Month", "Year"] as const;

function Dashboard() {
  const { store, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const isStaff = roles.length > 0 && !isAdmin;
  const [range, setRange] = useState<typeof RANGES[number]>("Month");
  const [orders, setOrders] = useState<any[]>([]);
  const [stockUnits, setStockUnits] = useState(0);

  const load = () => {
    if (!store) return;
    const now = new Date();
    const start = new Date(now);
    if (range === "Today") start.setHours(0, 0, 0, 0);
    else if (range === "Week") start.setDate(now.getDate() - 6);
    else if (range === "Month") start.setDate(now.getDate() - 29);
    else if (range === "Year") start.setMonth(now.getMonth() - 11);
    supabase.from("orders").select("*").eq("store_id", store.id)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false }).limit(1000)
      .then(({ data }) => setOrders(data || []));
    supabase.from("products").select("stock_qty").eq("store_id", store.id)
      .then(({ data }) => setStockUnits((data || []).reduce((s, p: any) => s + (p.stock_qty || 0), 0)));
  };
  useEffect(() => { load(); }, [store, range]);

  // Realtime: refresh KPIs/charts when orders or products change
  useEffect(() => {
    if (!store) return;
    const ch = supabase.channel("dash-" + store.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${store.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `store_id=eq.${store.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store, range]);

  const stats = useMemo(() => {
    const expected = orders.reduce((s, o) => s + Number(o.amount), 0);
    const actual = orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.amount), 0);
    const totalOrders = orders.length;
    const delivered = orders.filter(o => o.status === "delivered");
    const totalDelivered = delivered.reduce((s, o) => s + (o.units || 0), 0);
    const aov = totalOrders ? actual / totalOrders : 0;
    const deliveryRate = totalOrders ? Math.round((delivered.length / totalOrders) * 100) : 0;
    return { expected, actual, totalOrders, totalDelivered, aov, deliveryRate, deliveredCount: delivered.length };
  }, [orders]);

  const chartData = useMemo(() => {
    const buckets: Record<string, { Revenue: number; Orders: number }> = {};
    const days = range === "Today" ? 1 : range === "Week" ? 7 : range === "Month" ? 30 : 365;
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = { Revenue: 0, Orders: 0 };
    }
    orders.forEach(o => {
      const k = String(o.created_at).slice(0, 10);
      if (buckets[k]) { buckets[k].Revenue += Number(o.amount); buckets[k].Orders += 1; }
    });
    return Object.entries(buckets).map(([day, v]) => ({ day: day.slice(5), ...v }));
  }, [orders, range]);

  const kpis = [
    { label: "Expected Revenue", value: formatNaira(stats.expected) },
    { label: "Actual Revenue", value: formatNaira(stats.actual) },
    { label: "Total Orders", value: stats.totalOrders.toString() },
    { label: "Total Delivered Units", value: stats.totalDelivered.toString() },
    { label: "Average Order Value", value: formatNaira(stats.aov) },
    { label: "Total Stock Unit", value: stockUnits.toString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your store performance.</p>
        </div>
        <Select value={range} onValueChange={v => setRange(v as any)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-2 text-xl font-bold tracking-tight">{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Orders and Revenue Trends</h2>
              <p className="text-sm text-muted-foreground">Daily performance trend for orders and revenue.</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis yAxisId="left" stroke="var(--primary)" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--foreground)" fontSize={12} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Revenue" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="Orders" stroke="var(--foreground)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Order Status</h3>
              <Badge variant="secondary">{stats.deliveryRate}% delivery rate</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" />Delivered</span>
              <span className="font-semibold">{stats.deliveredCount}</span>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold mb-3">Latest Orders</h3>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent orders</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {orders.slice(0,5).map(o => (
                  <li key={o.id} className="flex justify-between">
                    <span className="truncate">{o.customer_name || "Customer"}</span>
                    <span className="font-medium">{formatNaira(Number(o.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {isStaff && <MyPerformanceCard />}

      <LowStockCard />

      {isAdmin && (
        <div className="grid md:grid-cols-2 gap-6">
          <StaffPerformanceCard />
          <Card className="p-6">
            <h3 className="font-semibold">Top 3 Best Performing Agents</h3>
            <div className="mt-6 text-center text-sm text-muted-foreground">No agent performance data yet</div>
          </Card>
        </div>
      )}
    </div>
  );
}
