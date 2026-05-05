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

export const Route = createFileRoute("/Dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Comart+" }, { name: "description", content: "Comart+ store dashboard: revenue, orders and performance in ₦." }] }),
  component: () => <ProtectedShell><Dashboard /></ProtectedShell>,
});

const RANGES = ["Today", "Week", "Month", "Year"] as const;

function Dashboard() {
  const { store } = useAuth();
  const [range, setRange] = useState<typeof RANGES[number]>("Today");
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!store) return;
    supabase.from("orders").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setOrders(data || []));
  }, [store]);

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
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return days.map(d => ({ day: d, Revenue: 0, Orders: 0 }));
  }, []);

  const kpis = [
    { label: "Expected Revenue", value: formatNaira(stats.expected) },
    { label: "Actual Revenue", value: formatNaira(stats.actual) },
    { label: "Total Orders", value: stats.totalOrders.toString() },
    { label: "Total Delivered Units", value: stats.totalDelivered.toString() },
    { label: "Average Order Value", value: formatNaira(stats.aov) },
    { label: "Total Stock Unit", value: "0" },
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

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold">Top 3 Best Performing Staff</h3>
          <div className="mt-6 text-center text-sm text-muted-foreground">No staff performance data yet</div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold">Top 3 Best Performing Agents</h3>
          <div className="mt-6 text-center text-sm text-muted-foreground">No agent performance data yet</div>
        </Card>
      </div>
    </div>
  );
}
