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
import { Plus, Pencil, AlertTriangle, Trash2 } from "lucide-react";

const ADMIN_ROLES = ["owner", "admin", "manager", "head_of_operations"];

export const Route = createFileRoute("/inventory/products")({
  head: () => ({ meta: [{ title: "Inventory Products — Comart+" }, { name: "description", content: "Manage your inventory product catalog and reorder points." }] }),
  component: () => <ProtectedShell><InventoryProducts /></ProtectedShell>,
});

const blank = { name: "", sku: "", category: "", buying_price: 0, selling_price: 0, stock_qty: 0, reorder_point: 0, status: "active" };

function InventoryProducts() {
  const { store, roles } = useAuth();
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r));
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(blank);

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("products").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, sku: p.sku || "", category: p.category || "", buying_price: p.buying_price, selling_price: p.selling_price, stock_qty: p.stock_qty, reorder_point: p.reorder_point || 0, status: p.status });
    setOpen(true);
  };

  const startNew = () => { setEditId(null); setForm(blank); setOpen(true); };

  const save = async () => {
    if (!store) return;
    if (!form.name) return toast.error("Name required");
    if (editId) {
      const { error } = await supabase.from("products").update(form).eq("id", editId);
      if (error) return toast.error(error.message);
      toast.success("Product updated");
    } else {
      const { data: p, error } = await supabase.from("products").insert({ ...form, store_id: store.id }).select().single();
      if (error) return toast.error(error.message);
      if (p && form.stock_qty > 0) {
        await supabase.from("stock_movements").insert({ store_id: store.id, product_id: p.id, product_name: p.name, type: "initial", qty_change: form.stock_qty, balance: form.stock_qty, reference: "Initial stock" });
      }
      toast.success("Product added");
    }
    setOpen(false); setEditId(null); setForm(blank); load();
  };

  const remove = async (p: any) => {
    if (!confirm(`Delete "${p.name}"? This removes the product from your catalog. Related stock movement history is kept.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted"); load();
  };

  const lowCount = rows.filter(p => Number(p.stock_qty) <= Number(p.reorder_point || 0)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog, stock, and reorder points.</p>
          {lowCount > 0 && <Badge variant="destructive" className="mt-2"><AlertTriangle className="h-3 w-3 mr-1" />{lowCount} item(s) at or below reorder point</Badge>}
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(blank); } }}>
          <DialogTrigger asChild><Button onClick={startNew}><Plus className="h-4 w-4 mr-1" />Add Product</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
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
                <div className="space-y-1.5"><Label>{editId ? "Stock Quantity" : "Initial Stock"}</Label><Input type="number" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Reorder Point</Label><Input type="number" value={form.reorder_point} onChange={e => setForm({ ...form, reorder_point: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
              </div>
              <Button onClick={save} className="w-full">{editId ? "Save changes" : "Save Product"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead>Buying</TableHead><TableHead>Selling</TableHead><TableHead>Stock</TableHead><TableHead>Reorder ≤</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No products yet.</TableCell></TableRow> :
              rows.map(p => {
                const low = Number(p.stock_qty) <= Number(p.reorder_point || 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.sku || "—"}</TableCell>
                    <TableCell>{p.category || "—"}</TableCell>
                    <TableCell>{formatNaira(Number(p.buying_price))}</TableCell>
                    <TableCell>{formatNaira(Number(p.selling_price))}</TableCell>
                    <TableCell><Badge variant={low ? "destructive" : "secondary"}>{p.stock_qty}{low && " · Low"}</Badge></TableCell>
                    <TableCell className="text-xs">{p.reorder_point || 0}</TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {isAdmin && <Button variant="ghost" size="icon" onClick={() => remove(p)} title="Delete product"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
