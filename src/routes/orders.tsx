import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — Comart+" }, { name: "description", content: "Create and manage customer orders." }] }),
  component: () => <ProtectedShell><Orders /></ProtectedShell>,
});

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

function Orders() {
  const { store, user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([{ product_id: "", quantity: 1 }]);

  const load = async () => {
    if (!store) return;
    const [{ data: o }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("orders").select("*, customers(name)").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name").eq("store_id", store.id),
      supabase.from("products").select("id, name, selling_price, stock_qty").eq("store_id", store.id).eq("status", "active"),
    ]);
    setOrders(o || []); setCustomers(c || []); setProducts(p || []);
  };
  useEffect(() => { load(); }, [store]);

  const filtered = useMemo(() => orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (customerFilter !== "all" && o.customer_id !== customerFilter) return false;
    if (from && o.created_at < from) return false;
    if (to && o.created_at > to + "T23:59:59") return false;
    return true;
  }), [orders, statusFilter, customerFilter, from, to]);

  const total = useMemo(() => items.reduce((sum, it) => {
    const p = products.find(pp => pp.id === it.product_id);
    return sum + (p ? Number(p.selling_price) * it.quantity : 0);
  }, 0), [items, products]);

  const create = async () => {
    if (!store || !user) return;
    if (!customerId) return toast.error("Select a customer");
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) return toast.error("Add at least one product");
    const totalUnits = validItems.reduce((s, i) => s + i.quantity, 0);
    const customer = customers.find(c => c.id === customerId);
    const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase();
    const { data: ord, error } = await supabase.from("orders").insert({
      store_id: store.id, customer_id: customerId, customer_name: customer?.name,
      amount: total, units: totalUnits, status: "pending", created_by: user.id, order_number: orderNumber,
    }).select().single();
    if (error || !ord) return toast.error(error?.message || "Failed");
    const itemsPayload = validItems.map(i => {
      const p = products.find(pp => pp.id === i.product_id)!;
      return { order_id: ord.id, store_id: store.id, product_id: p.id, product_name: p.name, quantity: i.quantity, unit_price: p.selling_price, subtotal: Number(p.selling_price) * i.quantity };
    });
    await supabase.from("order_items").insert(itemsPayload);
    await supabase.from("order_status_history").insert({ order_id: ord.id, store_id: store.id, status: "pending", changed_by: user.id, note: "Order created" });
    toast.success("Order created");
    setOpen(false); setCustomerId(""); setItems([{ product_id: "", quantity: 1 }]); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Orders</h1><p className="text-sm text-muted-foreground">Manage all orders across channels.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Create Order</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create New Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Products *</Label>
                {items.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={it.product_id} onValueChange={v => { const n = [...items]; n[idx].product_id = v; setItems(n); }}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {formatNaira(Number(p.selling_price))}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input type="number" min={1} className="w-24" value={it.quantity} onChange={e => { const n = [...items]; n[idx].quantity = Number(e.target.value) || 1; setItems(n); }} />
                    <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems([...items, { product_id: "", quantity: 1 }])}><Plus className="h-3 w-3 mr-1" />Add Product</Button>
              </div>
              <div className="border-t pt-3 flex justify-between items-center"><span className="font-medium">Total</span><span className="text-xl font-bold text-primary">{formatNaira(total)}</span></div>
              <Button onClick={create} className="w-full">Create Order</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Customers</SelectItem>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Order #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead>Units</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No orders found.</TableCell></TableRow> :
              filtered.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs"><Link to="/orders/$id" params={{ id: o.id }} className="hover:text-primary">{o.order_number || o.id.slice(0, 8)}</Link></TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{o.customers?.name || o.customer_name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                  <TableCell>{o.units}</TableCell>
                  <TableCell>{formatNaira(Number(o.amount))}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
