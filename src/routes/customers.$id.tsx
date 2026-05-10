import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/customers/$id")({
  head: () => ({ meta: [{ title: "Customer Profile — Comart+" }, { name: "description", content: "View customer profile and order history." }] }),
  component: () => <ProtectedShell><CustomerDetail /></ProtectedShell>,
});

function CustomerDetail() {
  const { id } = Route.useParams();
  const { store } = useAuth();
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      setCustomer(c);
      const { data: o } = await supabase.from("orders").select("*").eq("customer_id", id).order("created_at", { ascending: false });
      setOrders(o || []);
    })();
  }, [id, store]);

  const total = orders.reduce((a, o) => a + Number(o.amount || 0), 0);
  const segment = orders.length >= 5 ? "VIP" : orders.length >= 2 ? "Regular" : "New";
  const avg = orders.length ? total / orders.length : 0;
  const delivered = orders.filter(o => ["delivered", "completed", "fulfilled"].includes(String(o.status))).length;
  const lastOrder = orders[0]?.created_at;

  return (
    <div className="space-y-6">
      <Link to="/customer-service" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back to Customers</Link>
      {!customer ? <Card className="p-8 text-center text-muted-foreground">Loading...</Card> : (
        <>
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">{customer.name}</h1>
                <p className="text-sm text-muted-foreground">{customer.phone} · {customer.email || "—"}</p>
                <p className="text-sm text-muted-foreground mt-1">{[customer.city, customer.state].filter(Boolean).join(", ") || "—"}</p>
                {customer.full_address && <p className="text-sm mt-2">{customer.full_address}</p>}
              </div>
              <Badge className="text-sm" variant={segment === "VIP" ? "default" : "secondary"}>{segment}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t">
              <div><div className="text-xs text-muted-foreground">Total Orders</div><div className="text-xl font-bold">{orders.length}</div></div>
              <div><div className="text-xs text-muted-foreground">Lifetime Value</div><div className="text-xl font-bold">{formatNaira(total)}</div></div>
              <div><div className="text-xs text-muted-foreground">Avg. Order</div><div className="text-xl font-bold">{formatNaira(avg)}</div></div>
              <div><div className="text-xs text-muted-foreground">Delivered</div><div className="text-xl font-bold">{delivered}</div></div>
              <div><div className="text-xs text-muted-foreground">Last Order</div><div className="text-xl font-bold">{lastOrder ? new Date(lastOrder).toLocaleDateString() : "—"}</div></div>
            </div>
            {customer.notes && <p className="text-sm mt-4 p-3 rounded bg-muted">{customer.notes}</p>}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3 px-2">Order History</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {orders.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No orders yet.</TableCell></TableRow> :
                  orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-xs">{o.order_number || o.id.slice(0,8)}</TableCell>
                      <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                      <TableCell>{formatNaira(Number(o.amount))}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
