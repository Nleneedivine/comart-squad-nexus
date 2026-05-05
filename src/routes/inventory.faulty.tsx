import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/inventory/faulty")({
  head: () => ({ meta: [{ title: "Faulty Stocks — Comart+" }, { name: "description", content: "Track damaged or faulty inventory." }] }),
  component: () => <ProtectedShell><Faulty /></ProtectedShell>,
});

function Faulty() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ product_id: "", quantity: 1, reason: "", reported_date: new Date().toISOString().slice(0, 10) });

  const load = async () => {
    if (!store) return;
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("faulty_stocks").select("*").eq("store_id", store.id).order("reported_date", { ascending: false }),
      supabase.from("products").select("id, name, stock_qty").eq("store_id", store.id),
    ]);
    setRows(r || []); setProducts(p || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    const p: any = products.find(pp => pp.id === form.product_id);
    if (!p) return toast.error("Select product");
    if (form.quantity <= 0) return toast.error("Quantity must be > 0");
    if ((p.stock_qty || 0) < form.quantity) return toast.error(`Only ${p.stock_qty || 0} in stock`);
    const { error } = await supabase.from("faulty_stocks").insert({ store_id: store.id, product_id: p.id, product_name: p.name, quantity: form.quantity, reason: form.reason, reported_date: form.reported_date });
    if (error) return toast.error(error.message);
    const newBal = (p.stock_qty || 0) - form.quantity;
    await supabase.from("products").update({ stock_qty: newBal }).eq("id", p.id);
    await supabase.from("stock_movements").insert({
      store_id: store.id, product_id: p.id, product_name: p.name,
      type: "adjustment", qty_change: -form.quantity, balance: newBal,
      reference: `Faulty: ${form.reason || "no reason"}`.slice(0, 120),
    });
    toast.success("Faulty item logged & stock adjusted");
    setOpen(false); setForm({ product_id: "", quantity: 1, reason: "", reported_date: new Date().toISOString().slice(0, 10) }); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Faulty Stocks</h1><p className="text-sm text-muted-foreground">Log damaged or faulty inventory.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Log Faulty Item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Faulty Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Product</Label>
                <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.reported_date} onChange={e => setForm({ ...form, reported_date: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Reason</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No faulty items logged.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.reported_date).toLocaleDateString()}</TableCell>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell className="text-sm">{r.reason || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
