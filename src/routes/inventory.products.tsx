import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Plus } from "lucide-react";

export const Route = createFileRoute("/inventory/products")({
  head: () => ({ meta: [{ title: "Inventory Products — Comart+" }, { name: "description", content: "Manage your inventory product catalog." }] }),
  component: () => <ProtectedShell><InventoryProducts /></ProtectedShell>,
});

function InventoryProducts() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", sku: "", category: "", buying_price: 0, selling_price: 0, stock_qty: 0, status: "active" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("products").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    if (!form.name) return toast.error("Name required");
    const { data: p, error } = await supabase.from("products").insert({ ...form, store_id: store.id }).select().single();
    if (error) return toast.error(error.message);
    if (p && form.stock_qty > 0) {
      await supabase.from("stock_movements").insert({ store_id: store.id, product_id: p.id, product_name: p.name, type: "initial", qty_change: form.stock_qty, balance: form.stock_qty, reference: "Initial stock" });
    }
    toast.success("Product added");
    setOpen(false); setForm({ name: "", sku: "", category: "", buying_price: 0, selling_price: 0, stock_qty: 0, status: "active" }); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Inventory Products</h1><p className="text-sm text-muted-foreground">Manage your product catalog and stock.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Product</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Buying Price (₦)</Label><Input type="number" value={form.buying_price} onChange={e => setForm({ ...form, buying_price: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Selling Price (₦)</Label><Input type="number" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Initial Stock</Label><Input type="number" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: Number(e.target.value) })} /></div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={save} className="w-full">Save Product</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead>Buying</TableHead><TableHead>Selling</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No products yet.</TableCell></TableRow> :
              rows.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs">{p.sku || "—"}</TableCell>
                  <TableCell>{p.category || "—"}</TableCell>
                  <TableCell>{formatNaira(Number(p.buying_price))}</TableCell>
                  <TableCell>{formatNaira(Number(p.selling_price))}</TableCell>
                  <TableCell>
                    <Badge variant={p.stock_qty < 10 ? "destructive" : "secondary"}>{p.stock_qty} {p.stock_qty < 10 && "· Low"}</Badge>
                  </TableCell>
                  <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
