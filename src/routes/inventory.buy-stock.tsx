import { createFileRoute } from "@tanstack/react-router";
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
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/inventory/buy-stock")({
  head: () => ({ meta: [{ title: "Buy Stock — Comart+" }, { name: "description", content: "Record new stock purchases." }] }),
  component: () => <ProtectedShell><BuyStock /></ProtectedShell>,
});

function BuyStock() {
  const { store, user } = useAuth();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<{ product_id: string; quantity: number; amount: number }[]>([{ product_id: "", quantity: 1, amount: 0 }]);
  const [notes, setNotes] = useState("");

  const load = async () => {
    if (!store) return;
    const [{ data: pur }, { data: prods }] = await Promise.all([
      supabase.from("purchases").select("*, purchase_items(quantity, product_name)").eq("store_id", store.id).order("purchase_date", { ascending: false }),
      supabase.from("products").select("id, name, stock_qty").eq("store_id", store.id),
    ]);
    setPurchases(pur || []); setProducts(prods || []);
  };
  useEffect(() => { load(); }, [store]);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount || 0), 0), [items]);

  const save = async () => {
    if (!store || !user) return;
    const valid = items.filter(i => i.product_id && i.quantity > 0);
    if (valid.length === 0) return toast.error("Add at least one product");
    const { data: pur, error } = await supabase.from("purchases").insert({ store_id: store.id, purchase_date: date, total_amount: total, notes, created_by: user.id }).select().single();
    if (error || !pur) return toast.error(error?.message || "Failed");
    const itemsPayload = valid.map(i => {
      const p = products.find(pp => pp.id === i.product_id)!;
      return { purchase_id: pur.id, store_id: store.id, product_id: p.id, product_name: p.name, quantity: i.quantity, amount: i.amount };
    });
    await supabase.from("purchase_items").insert(itemsPayload);
    for (const i of valid) {
      const p = products.find(pp => pp.id === i.product_id)!;
      const newBalance = (p.stock_qty || 0) + i.quantity;
      await supabase.from("products").update({ stock_qty: newBalance }).eq("id", p.id);
      await supabase.from("stock_movements").insert({ store_id: store.id, product_id: p.id, product_name: p.name, type: "purchase", qty_change: i.quantity, balance: newBalance, reference: `Purchase ${pur.id.slice(0,8)}` });
    }
    toast.success("Purchase recorded");
    setOpen(false); setItems([{ product_id: "", quantity: 1, amount: 0 }]); setNotes(""); load();
  };

  const remove = async (p: any) => {
    if (!store) return;
    if (!confirm("Delete this purchase? Its quantities will be subtracted back out of the Stock Record.")) return;
    // Load items if not already on the row
    const items = p.purchase_items as { product_name: string; quantity: number; product_id?: string }[] | undefined;
    const { data: fullItems } = items?.length
      ? { data: items as any[] }
      : await supabase.from("purchase_items").select("product_id, product_name, quantity").eq("purchase_id", p.id);
    for (const it of (fullItems || [])) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase.from("products").select("id, stock_qty").eq("id", it.product_id).maybeSingle();
      if (!prod) continue;
      const newBalance = Math.max(0, (prod.stock_qty || 0) - (it.quantity || 0));
      await supabase.from("products").update({ stock_qty: newBalance }).eq("id", prod.id);
      await supabase.from("stock_movements").insert({
        store_id: store.id, product_id: prod.id, product_name: it.product_name,
        type: "adjustment", qty_change: -(it.quantity || 0), balance: newBalance,
        reference: `Purchase reversal ${p.id.slice(0,8)}`,
      });
    }
    await supabase.from("purchase_items").delete().eq("purchase_id", p.id);
    const { error } = await supabase.from("purchases").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Purchase deleted and stock adjusted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Buy Stock</h1><p className="text-sm text-muted-foreground">Record new inventory purchases.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add New Purchase</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Purchase</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Products</Label>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6">
                      <Select value={it.product_id} onValueChange={v => { const n = [...items]; n[idx].product_id = v; setItems(n); }}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={it.quantity} onChange={e => { const n = [...items]; n[idx].quantity = Number(e.target.value) || 1; setItems(n); }} />
                    <Input className="col-span-3" type="number" placeholder="Amount ₦" value={it.amount} onChange={e => { const n = [...items]; n[idx].amount = Number(e.target.value); setItems(n); }} />
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems([...items, { product_id: "", quantity: 1, amount: 0 }])}><Plus className="h-3 w-3 mr-1" />Add Another Product</Button>
              </div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
              <div className="border-t pt-3 flex justify-between"><span className="font-medium">Total</span><span className="text-xl font-bold text-primary">{formatNaira(total)}</span></div>
              <Button onClick={save} className="w-full">Record Purchase</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 px-2">Purchase History</h2>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Products</TableHead><TableHead>Total</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {purchases.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No purchases yet.</TableCell></TableRow> :
              purchases.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{(p.purchase_items || []).map((i: any) => `${i.product_name} (${i.quantity})`).join(", ") || "—"}</TableCell>
                  <TableCell className="font-medium">{formatNaira(Number(p.total_amount))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(p)} title="Delete purchase"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
