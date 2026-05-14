import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Truck, Phone, Mail, Banknote, Edit2 } from "lucide-react";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — Comart+" }, { name: "description", content: "Manage suppliers and supplier payments." }] }),
  component: () => <ProtectedShell><Suppliers /></ProtectedShell>,
});

function Suppliers() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const [rows, setRows] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", contact_person: "", phone: "", email: "", address: "", category: "", notes: "" });
  const [pay, setPay] = useState<any>({ supplier_id: "", amount: "", reference: "", notes: "" });

  const load = async () => {
    if (!store) return;
    const [{ data: s }, { data: p }, { data: po }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("store_id", store.id).order("name"),
      supabase.from("supplier_payments").select("*").eq("store_id", store.id).order("paid_at", { ascending: false }),
      supabase.from("purchase_orders").select("id, supplier_id, total, amount_paid, status").eq("store_id", store.id),
    ]);
    setRows(s || []); setPayments(p || []); setPos(po || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    if (!form.name.trim()) return toast.error("Name required");
    if (editing) {
      const { error } = await supabase.from("suppliers").update(form).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("suppliers").insert({ ...form, store_id: store.id });
      if (error) return toast.error(error.message);
      toast.success("Supplier added");
    }
    setOpen(false); setEditing(null);
    setForm({ name: "", contact_person: "", phone: "", email: "", address: "", category: "", notes: "" });
    load();
  };

  const savePayment = async () => {
    if (!store) return;
    if (!pay.supplier_id || !pay.amount) return toast.error("Supplier and amount required");
    const { error } = await supabase.from("supplier_payments").insert({
      store_id: store.id, supplier_id: pay.supplier_id,
      amount: Number(pay.amount), reference: pay.reference, notes: pay.notes, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    // also log to finance as expense
    await supabase.from("finance_records").insert({
      store_id: store.id, type: "expense", category: "Inventory Purchase",
      description: `Supplier payment: ${rows.find(r => r.id === pay.supplier_id)?.name || ""} ${pay.reference ? `(${pay.reference})` : ""}`,
      amount: Number(pay.amount), source: pay.reference || "supplier-payment", created_by: user?.id,
    });
    toast.success("Payment recorded");
    setPayOpen(false); setPay({ supplier_id: "", amount: "", reference: "", notes: "" }); load();
  };

  const stats = (sid: string) => {
    const supplierPos = pos.filter(p => p.supplier_id === sid);
    const totalOrdered = supplierPos.reduce((s, p) => s + Number(p.total || 0), 0);
    const paidViaPO = supplierPos.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    const directPayments = payments.filter(p => p.supplier_id === sid).reduce((s, p) => s + Number(p.amount || 0), 0);
    return { totalOrdered, totalPaid: paidViaPO + directPayments, balance: totalOrdered - paidViaPO - directPayments, orderCount: supplierPos.length };
  };

  const startEdit = (s: any) => {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", email: s.email || "", address: s.address || "", category: s.category || "", notes: s.notes || "" });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6 text-primary" />Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage suppliers, payments and balances.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button variant="outline"><Banknote className="h-4 w-4 mr-1" />Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Supplier</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3" value={pay.supplier_id} onChange={e => setPay({ ...pay, supplier_id: e.target.value })}>
                    <option value="">Select supplier</option>
                    {rows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Reference</Label><Input value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} placeholder="Cheque no, transfer ref..." /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={pay.notes} onChange={e => setPay({ ...pay, notes: e.target.value })} /></div>
                <Button onClick={savePayment} className="w-full">Save Payment</Button>
              </div>
            </DialogContent>
          </Dialog>}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm({ name: "", contact_person: "", phone: "", email: "", address: "", category: "", notes: "" }); }}}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Electronics" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={save} className="w-full">{editing ? "Update" : "Save"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Suppliers ({rows.length})</TabsTrigger>
          <TabsTrigger value="payments">Payment History ({payments.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <Card className="p-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No suppliers yet.</TableCell></TableRow> :
                  rows.map(s => {
                    const st = stats(s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell><div className="font-medium">{s.name}</div>{s.contact_person && <div className="text-xs text-muted-foreground">{s.contact_person}</div>}</TableCell>
                        <TableCell className="text-xs">
                          {s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}
                          {s.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>}
                        </TableCell>
                        <TableCell>{s.category || "—"}</TableCell>
                        <TableCell className="text-right">{st.orderCount}</TableCell>
                        <TableCell className="text-right">{formatNaira(st.totalOrdered)}</TableCell>
                        <TableCell className="text-right text-emerald-500">{formatNaira(st.totalPaid)}</TableCell>
                        <TableCell className={"text-right font-semibold " + (st.balance > 0 ? "text-rose-500" : "text-foreground")}>{formatNaira(st.balance)}</TableCell>
                        <TableCell>{isAdmin && <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Edit2 className="h-3 w-3" /></Button>}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Card className="p-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Reference</TableHead>
                <TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {payments.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow> :
                  payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{new Date(p.paid_at).toLocaleDateString()}</TableCell>
                      <TableCell>{rows.find(r => r.id === p.supplier_id)?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{p.reference || "—"}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{p.notes || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatNaira(Number(p.amount))}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
