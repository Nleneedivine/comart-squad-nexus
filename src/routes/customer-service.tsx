import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Users, MapPin, Plus } from "lucide-react";

export const Route = createFileRoute("/customer-service")({
  head: () => ({ meta: [
    { title: "Customers — Comart+" },
    { name: "description", content: "Manage your customer CRM, contacts and order history." },
  ]}),
  component: () => <ProtectedShell><Customers /></ProtectedShell>,
});

function Customers() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, { orders: number; spent: number; last: string | null }>>({});
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", phone: "", email: "", state: "", city: "", address: "", full_address: "", notes: "" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("customers").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
    const { data: orders } = await supabase.from("orders").select("customer_id, amount, created_at").eq("store_id", store.id);
    const map: Record<string, { orders: number; spent: number; last: string | null }> = {};
    (orders || []).forEach((o: any) => {
      if (!o.customer_id) return;
      if (!map[o.customer_id]) map[o.customer_id] = { orders: 0, spent: 0, last: null };
      map[o.customer_id].orders += 1;
      map[o.customer_id].spent += Number(o.amount || 0);
      if (!map[o.customer_id].last || o.created_at > map[o.customer_id].last!) map[o.customer_id].last = o.created_at;
    });
    setStats(map);
  };
  useEffect(() => { load(); }, [store]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || r.name?.toLowerCase().includes(q) || r.phone?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q));
  }, [rows, search]);

  const totalCustomers = rows.length;
  const statesCovered = new Set(rows.map(r => r.state).filter(Boolean)).size;

  const save = async () => {
    if (!store) return;
    if (!form.name || !form.phone) return toast.error("Name and phone are required");
    const { error } = await supabase.from("customers").insert({ ...form, store_id: store.id });
    if (error) return toast.error(error.message);
    toast.success("Customer added");
    setOpen(false);
    setForm({ name: "", phone: "", email: "", state: "", city: "", address: "", full_address: "", notes: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Customer CRM and order history.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Customer</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Phone *</Label><Input placeholder="08012345678" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select value={form.state} onValueChange={v => setForm({ ...form, state: v })}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{NIGERIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Full Address</Label><Textarea value={form.full_address} onChange={e => setForm({ ...form, full_address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save Customer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><Users className="h-6 w-6" /></div>
          <div><div className="text-sm text-muted-foreground">Total Customers</div><div className="text-2xl font-bold">{totalCustomers}</div></div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><MapPin className="h-6 w-6" /></div>
          <div><div className="text-sm text-muted-foreground">States Covered</div><div className="text-2xl font-bold">{statesCovered}</div></div>
        </Card>
      </div>

      <Card className="p-4">
        <Input placeholder="Search by name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} className="mb-4 max-w-sm" />
        <Table>
          <TableHeader>
            <TableRow><TableHead>Customer</TableHead><TableHead>Contact</TableHead><TableHead>State</TableHead><TableHead>City</TableHead><TableHead>Total Orders</TableHead><TableHead>Total Spent</TableHead><TableHead>Last Order</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No customers yet.</TableCell></TableRow>
            ) : filtered.map(c => {
              const s = stats[c.id] || { orders: 0, spent: 0, last: null };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium"><Link to="/customers/$id" params={{ id: c.id }} className="hover:text-primary">{c.name}</Link></TableCell>
                  <TableCell>{c.phone}{c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}</TableCell>
                  <TableCell>{c.state || "—"}</TableCell>
                  <TableCell>{c.city || "—"}</TableCell>
                  <TableCell>{s.orders}</TableCell>
                  <TableCell>{formatNaira(s.spent)}</TableCell>
                  <TableCell>{s.last ? new Date(s.last).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
