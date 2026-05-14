import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, ClipboardList, CheckCircle2, XCircle, Trash2, Package, FileText } from "lucide-react";
import { captureError } from "@/lib/sentry";

export const Route = createFileRoute("/purchase-orders")({
  head: () => ({ meta: [{ title: "Purchase Orders — Comart+" }, { name: "description", content: "Create and receive purchase orders. Inventory updates automatically." }] }),
  component: () => <ProtectedShell><PurchaseOrders /></ProtectedShell>,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/15 text-blue-500",
  partially_received: "bg-amber-500/15 text-amber-500",
  received: "bg-emerald-500/15 text-emerald-500",
  cancelled: "bg-rose-500/15 text-rose-500",
};

function PurchaseOrders() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ supplier_id: "", expected_date: "", tax: 0, notes: "", items: [] as any[] });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [recv, setRecv] = useState<Record<string, { received: number; damaged: number }>>({});

  const load = async () => {
    if (!store) return;
    const [{ data: po }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name").eq("store_id", store.id).order("name"),
      supabase.from("products").select("id, name, buying_price, stock_qty").eq("store_id", store.id).order("name"),
    ]);
    setPos(po || []); setSuppliers(s || []); setProducts(p || []);
  };
  useEffect(() => { load(); }, [store]);

  const loadDetail = async (id: string) => {
    const { data } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", id).order("created_at");
    setDetailItems(data || []);
    const map: Record<string, { received: number; damaged: number }> = {};
    (data || []).forEach((it: any) => { map[it.id] = { received: 0, damaged: 0 }; });
    setRecv(map);
  };
  useEffect(() => { if (detailId) loadDetail(detailId); }, [detailId]);

  const detailPo = useMemo(() => pos.find(p => p.id === detailId), [pos, detailId]);

  // ---- Create PO ----
  const addItem = () => setForm((f: any) => ({ ...f, items: [...f.items, { product_id: "", product_name: "", quantity: 1, unit_cost: 0 }] }));
  const updateItem = (i: number, patch: any) => setForm((f: any) => {
    const items = [...f.items]; items[i] = { ...items[i], ...patch };
    if (patch.product_id) {
      const p = products.find(x => x.id === patch.product_id);
      if (p) { items[i].product_name = p.name; items[i].unit_cost = p.buying_price || items[i].unit_cost; }
    }
    return { ...f, items };
  });
  const removeItem = (i: number) => setForm((f: any) => ({ ...f, items: f.items.filter((_: any, idx: number) => idx !== i) }));

  const subtotal = useMemo(() => form.items.reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0), [form.items]);
  const total = subtotal + Number(form.tax || 0);

  const createPo = async () => {
    if (!store) return;
    if (!form.supplier_id) return toast.error("Select supplier");
    if (form.items.length === 0) return toast.error("Add at least one item");
    if (form.items.some((i: any) => !i.product_name || i.quantity <= 0)) return toast.error("All items need a product and quantity");

    const po_number = `PO-${Date.now().toString().slice(-8)}`;
    const { data: po, error } = await supabase.from("purchase_orders").insert({
      store_id: store.id, supplier_id: form.supplier_id, po_number,
      status: "draft", subtotal, tax: Number(form.tax || 0), total,
      expected_date: form.expected_date || null, notes: form.notes, created_by: user?.id,
    }).select().single();
    if (error || !po) { captureError(error, { module: "purchase_orders", message: "create_po_failed" }); return toast.error(error?.message || "Failed"); }

    const items = form.items.map((i: any) => ({
      store_id: store.id, purchase_order_id: po.id,
      product_id: i.product_id || null, product_name: i.product_name,
      quantity: Number(i.quantity), unit_cost: Number(i.unit_cost),
      subtotal: Number(i.quantity) * Number(i.unit_cost),
    }));
    const { error: itErr } = await supabase.from("purchase_order_items").insert(items);
    if (itErr) { captureError(itErr, { module: "purchase_orders", message: "create_po_items_failed" }); return toast.error(itErr.message); }

    toast.success("PO created"); setOpen(false);
    setForm({ supplier_id: "", expected_date: "", tax: 0, notes: "", items: [] });
    load();
  };

  // ---- PO actions ----
  const setStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "approved") { patch.approved_by = user?.id; patch.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status.replace("_", " ")}`); load();
  };

  const receiveItems = async () => {
    if (!detailId) return;
    const items = Object.entries(recv)
      .filter(([_, v]) => v.received > 0 || v.damaged > 0)
      .map(([id, v]) => ({ id, received: v.received, damaged: v.damaged }));
    if (items.length === 0) return toast.error("Enter received quantities");
    const { error } = await supabase.rpc("receive_purchase_order_items", { _po_id: detailId, _items: items as any });
    if (error) { captureError(error, { module: "purchase_orders", message: "receive_failed", tags: { po_id: detailId } }); return toast.error(error.message); }
    toast.success("Stock received & inventory updated");
    await loadDetail(detailId); load();
  };

  const split = (status: string) => pos.filter(p => status === "all" ? true : p.status === status);
  const cnt = (st: string) => pos.filter(p => p.status === st).length;

  const renderTable = (data: any[]) => (
    <Table>
      <TableHeader><TableRow>
        <TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
        <TableHead>Expected</TableHead><TableHead className="text-right">Total</TableHead>
        <TableHead>Status</TableHead><TableHead></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {data.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No purchase orders.</TableCell></TableRow> :
          data.map(p => (
            <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetailId(p.id)}>
              <TableCell className="font-mono text-xs">{p.po_number}</TableCell>
              <TableCell>{suppliers.find(s => s.id === p.supplier_id)?.name || "—"}</TableCell>
              <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-xs">{p.expected_date || "—"}</TableCell>
              <TableCell className="text-right font-medium">{formatNaira(Number(p.total))}</TableCell>
              <TableCell><Badge className={STATUS_COLORS[p.status]}>{p.status.replace("_", " ")}</Badge></TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetailId(p.id); }}>View</Button></TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" />Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Order from suppliers, receive stock, and update inventory automatically.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Purchase Order</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Supplier *</Label>
                  <select className="w-full h-10 rounded-md border bg-background px-3" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>Expected Date</Label><Input type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} /></div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2"><Label>Items</Label><Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add Item</Button></div>
                <div className="space-y-2">
                  {form.items.length === 0 && <p className="text-xs text-muted-foreground">No items. Click "Add Item".</p>}
                  {form.items.map((it: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded p-2">
                      <div className="col-span-5">
                        <Label className="text-xs">Product</Label>
                        <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={it.product_id} onChange={e => updateItem(i, { product_id: e.target.value })}>
                          <option value="">Custom item</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!it.product_id && <Input className="mt-1 h-8 text-xs" placeholder="Item name" value={it.product_name} onChange={e => updateItem(i, { product_name: e.target.value })} />}
                      </div>
                      <div className="col-span-2"><Label className="text-xs">Qty</Label><Input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) })} /></div>
                      <div className="col-span-2"><Label className="text-xs">Unit ₦</Label><Input type="number" value={it.unit_cost} onChange={e => updateItem(i, { unit_cost: Number(e.target.value) })} /></div>
                      <div className="col-span-2 text-right text-sm font-medium">{formatNaira(Number(it.quantity || 0) * Number(it.unit_cost || 0))}</div>
                      <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-3 w-3" /></Button></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Tax / Shipping (₦)</Label><Input type="number" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>

              <div className="flex justify-between items-center border-t pt-3">
                <div className="text-sm text-muted-foreground">Subtotal: {formatNaira(subtotal)} · Tax: {formatNaira(Number(form.tax || 0))}</div>
                <div className="text-lg font-bold text-primary">Total: {formatNaira(total)}</div>
              </div>
              <Button onClick={createPo} className="w-full">Create PO (Draft)</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({pos.length})</TabsTrigger>
          <TabsTrigger value="draft">Draft ({cnt("draft")})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({cnt("approved")})</TabsTrigger>
          <TabsTrigger value="partially_received">Partial ({cnt("partially_received")})</TabsTrigger>
          <TabsTrigger value="received">Received ({cnt("received")})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled ({cnt("cancelled")})</TabsTrigger>
        </TabsList>
        {["all","draft","approved","partially_received","received","cancelled"].map(s => (
          <TabsContent key={s} value={s}><Card className="p-4">{renderTable(split(s))}</Card></TabsContent>
        ))}
      </Tabs>

      {/* Detail / Receive Sheet */}
      <Sheet open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          {detailPo && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{detailPo.po_number}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Supplier</div><div className="font-medium">{suppliers.find(s => s.id === detailPo.supplier_id)?.name}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><Badge className={STATUS_COLORS[detailPo.status]}>{detailPo.status.replace("_", " ")}</Badge></div>
                  <div><div className="text-xs text-muted-foreground">Created</div><div>{new Date(detailPo.created_at).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Expected</div><div>{detailPo.expected_date || "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Subtotal</div><div>{formatNaira(Number(detailPo.subtotal))}</div></div>
                  <div><div className="text-xs text-muted-foreground">Tax</div><div>{formatNaira(Number(detailPo.tax))}</div></div>
                  <div className="col-span-2"><div className="text-xs text-muted-foreground">Total</div><div className="text-lg font-bold text-primary">{formatNaira(Number(detailPo.total))}</div></div>
                  {detailPo.notes && <div className="col-span-2"><div className="text-xs text-muted-foreground">Notes</div><div className="text-sm">{detailPo.notes}</div></div>}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2"><Package className="h-4 w-4" /><span className="font-medium">Items</span></div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Product</TableHead><TableHead>Ordered</TableHead><TableHead>Received</TableHead><TableHead>Damaged</TableHead>
                      {(detailPo.status === "approved" || detailPo.status === "partially_received") && <><TableHead>Receive</TableHead><TableHead>Damaged</TableHead></>}
                    </TableRow></TableHeader>
                    <TableBody>
                      {detailItems.map(it => {
                        const remaining = it.quantity - it.received_qty - it.damaged_qty;
                        return (
                          <TableRow key={it.id}>
                            <TableCell className="text-sm">{it.product_name}</TableCell>
                            <TableCell>{it.quantity}</TableCell>
                            <TableCell className="text-emerald-500">{it.received_qty}</TableCell>
                            <TableCell className="text-rose-500">{it.damaged_qty}</TableCell>
                            {(detailPo.status === "approved" || detailPo.status === "partially_received") && <>
                              <TableCell><Input type="number" min={0} max={remaining} className="h-8 w-20" value={recv[it.id]?.received || 0} onChange={e => setRecv({ ...recv, [it.id]: { ...recv[it.id], received: Math.min(Number(e.target.value), remaining), damaged: recv[it.id]?.damaged || 0 } })} /></TableCell>
                              <TableCell><Input type="number" min={0} max={remaining} className="h-8 w-20" value={recv[it.id]?.damaged || 0} onChange={e => setRecv({ ...recv, [it.id]: { received: recv[it.id]?.received || 0, damaged: Math.min(Number(e.target.value), remaining) } })} /></TableCell>
                            </>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {isAdmin && <div className="flex flex-wrap gap-2 border-t pt-3">
                  {detailPo.status === "draft" && <>
                    <Button size="sm" onClick={() => setStatus(detailPo.id, "approved")}><CheckCircle2 className="h-3 w-3 mr-1" />Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(detailPo.id, "cancelled")}><XCircle className="h-3 w-3 mr-1" />Cancel</Button>
                  </>}
                  {(detailPo.status === "approved" || detailPo.status === "partially_received") && <>
                    <Button size="sm" onClick={receiveItems}><Package className="h-3 w-3 mr-1" />Receive Stock</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(detailPo.id, "cancelled")}><XCircle className="h-3 w-3 mr-1" />Cancel</Button>
                  </>}
                </div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
