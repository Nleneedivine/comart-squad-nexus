import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Archive, ArchiveRestore, UserPlus, RefreshCw, Check, ChevronsUpDown, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/")({
  head: () => ({ meta: [{ title: "All Orders — Comart+" }, { name: "description", content: "View and manage all your customer orders in one place." }] }),
  component: OrdersIndex,
});

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
type Mode = "existing" | "new";

function OrdersIndex() {
  const { store, user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("existing");
  const [customerId, setCustomerId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", address: "", email: "" });
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([{ product_id: "", quantity: 1 }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkAssignee, setBulkAssignee] = useState<string>("");

  const load = async () => {
    if (!store) return;
    const [{ data: o }, { data: c }, { data: p }, { data: roles }] = await Promise.all([
      supabase.from("orders").select("*, customers(name)").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, phone, full_address").eq("store_id", store.id).order("name"),
      supabase.from("products").select("id, name, selling_price, stock_qty").eq("store_id", store.id).eq("status", "active"),
      supabase.from("user_roles").select("user_id, role, is_suspended, profiles:user_id(id, full_name, email)").eq("store_id", store.id),
    ]);
    setOrders(o || []); setCustomers(c || []); setProducts(p || []);
    const list = (roles || []).filter((r: any) => !r.is_suspended).map((r: any) => ({
      id: r.user_id, name: r.profiles?.full_name || r.profiles?.email || r.user_id.slice(0, 8), role: r.role,
    }));
    const dedup = Array.from(new Map(list.map((x: any) => [x.id, x])).values());
    setStaff(dedup);
  };
  useEffect(() => { load(); }, [store]);

  const filtered = useMemo(() => orders.filter(o => {
    if (!showArchived && o.is_archived) return false;
    if (showArchived && !o.is_archived) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (customerFilter !== "all" && o.customer_id !== customerFilter) return false;
    if (from && o.created_at < from) return false;
    if (to && o.created_at > to + "T23:59:59") return false;
    return true;
  }), [orders, statusFilter, customerFilter, from, to, showArchived]);

  const total = useMemo(() => items.reduce((sum, it) => {
    const p = products.find(pp => pp.id === it.product_id);
    return sum + (p ? Number(p.selling_price) * it.quantity : 0);
  }, 0), [items, products]);

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(filtered.map(o => o.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected); checked ? next.add(id) : next.delete(id); setSelected(next);
  };

  const resetForm = () => {
    setMode("existing"); setCustomerId(""); setNewCust({ name: "", phone: "", address: "", email: "" });
    setItems([{ product_id: "", quantity: 1 }]);
  };

  const create = async () => {
    if (!store || !user) return;
    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    if (validItems.length === 0) return toast.error("Add at least one product");

    let cId = customerId;
    let cName = customers.find(c => c.id === customerId)?.name;

    if (mode === "new") {
      if (!newCust.name.trim() || !newCust.phone.trim()) return toast.error("New customer needs name and phone");
      // try match existing by phone
      const { data: existing } = await supabase.from("customers").select("id, name").eq("store_id", store.id).eq("phone", newCust.phone.trim()).maybeSingle();
      if (existing) { cId = existing.id; cName = existing.name; toast.info(`Reusing existing customer ${existing.name}`); }
      else {
        const { data: c, error: cErr } = await supabase.from("customers").insert({
          store_id: store.id, name: newCust.name.trim(), phone: newCust.phone.trim(),
          full_address: newCust.address.trim() || null, email: newCust.email.trim() || null,
        }).select("id, name").single();
        if (cErr || !c) return toast.error(cErr?.message || "Couldn't create customer");
        cId = c.id; cName = c.name;
      }
    } else if (!cId) {
      return toast.error("Select a customer or add a new one");
    }

    const totalUnits = validItems.reduce((s, i) => s + i.quantity, 0);
    const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase();
    const { data: ord, error } = await supabase.from("orders").insert({
      store_id: store.id, customer_id: cId, customer_name: cName,
      amount: total, units: totalUnits, status: "pending", created_by: user.id, order_number: orderNumber,
    }).select().single();
    if (error || !ord) return toast.error(error?.message || "Failed");
    const itemsPayload = validItems.map(i => {
      const p = products.find(pp => pp.id === i.product_id)!;
      return { order_id: ord.id, store_id: store.id, product_id: p.id, product_name: p.name, quantity: i.quantity, unit_price: p.selling_price, subtotal: Number(p.selling_price) * i.quantity };
    });
    await supabase.from("order_items").insert(itemsPayload);
    await supabase.from("order_status_history").insert({ order_id: ord.id, store_id: store.id, status: "pending", changed_by: user.id, note: "Order created" });
    for (const it of validItems) {
      const p = products.find(pp => pp.id === it.product_id)!;
      const newBal = Math.max(0, (p.stock_qty || 0) - it.quantity);
      await supabase.from("products").update({ stock_qty: newBal }).eq("id", p.id);
      await supabase.from("stock_movements").insert({
        store_id: store.id, product_id: p.id, product_name: p.name,
        type: "sale", qty_change: -it.quantity, balance: newBal, reference: `Order ${orderNumber}`,
      });
    }
    await supabase.from("activity_log").insert({
      store_id: store.id, user_id: user.id, type: "order",
      activity: `Created order ${orderNumber} (${formatNaira(total)})`,
    });
    toast.success("Order created");
    setOpen(false); resetForm(); load();
  };

  const bulkApplyStatus = async () => {
    if (!bulkStatus || selected.size === 0 || !store || !user) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("orders").update({ status: bulkStatus as any }).in("id", ids).eq("store_id", store.id);
    if (error) return toast.error(error.message);
    await supabase.from("order_status_history").insert(ids.map(id => ({ order_id: id, store_id: store.id, status: bulkStatus as any, changed_by: user.id, note: "Bulk update" })));
    await supabase.from("activity_log").insert({ store_id: store.id, user_id: user.id, type: "order", activity: `Bulk set ${ids.length} orders to ${bulkStatus}` });
    toast.success(`Updated ${ids.length} orders`); setSelected(new Set()); setBulkStatus(""); load();
  };

  const bulkAssign = async () => {
    if (!bulkAssignee || selected.size === 0 || !store || !user) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("orders").update({ assigned_to: bulkAssignee, assigned_at: new Date().toISOString() }).in("id", ids).eq("store_id", store.id);
    if (error) return toast.error(error.message);
    const name = staff.find(s => s.id === bulkAssignee)?.name || "staff";
    await supabase.from("activity_log").insert({ store_id: store.id, user_id: user.id, type: "order", activity: `Assigned ${ids.length} orders to ${name}` });
    toast.success(`Assigned ${ids.length} orders`); setSelected(new Set()); setBulkAssignee(""); load();
  };

  const bulkArchive = async (archive: boolean) => {
    if (selected.size === 0 || !store || !user) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("orders").update({ is_archived: archive }).in("id", ids).eq("store_id", store.id);
    if (error) return toast.error(error.message);
    await supabase.from("activity_log").insert({ store_id: store.id, user_id: user.id, type: "order", activity: `${archive ? "Archived" : "Restored"} ${ids.length} orders` });
    toast.success(`${archive ? "Archived" : "Restored"} ${ids.length}`); setSelected(new Set()); load();
  };

  // Round-robin assign all unassigned orders in current view
  const distributeRoundRobin = async () => {
    if (!store || !user) return;
    if (staff.length === 0) return toast.error("No active staff to distribute to");
    const candidates = staff.filter(s => ["sales_rep","order_manager","customer_care","logistics_manager","manager"].includes(s.role) || true);
    const targets = candidates.length > 0 ? candidates : staff;
    const unassigned = filtered.filter(o => !o.assigned_to);
    if (unassigned.length === 0) return toast.info("All visible orders already assigned");
    // current open count per rep
    const counts: Record<string, number> = {};
    for (const t of targets) {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("store_id", store.id).eq("assigned_to", t.id).eq("is_archived", false)
        .in("status", ["pending","processing","shipped"]);
      counts[t.id] = count || 0;
    }
    const updates: { id: string; assigned_to: string }[] = [];
    for (const o of unassigned) {
      const next = targets.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b);
      updates.push({ id: o.id, assigned_to: next.id });
      counts[next.id] += 1;
    }
    for (const u of updates) {
      await supabase.from("orders").update({ assigned_to: u.assigned_to, assigned_at: new Date().toISOString() }).eq("id", u.id);
    }
    await supabase.from("activity_log").insert({ store_id: store.id, user_id: user.id, type: "order", activity: `Round-robin assigned ${updates.length} orders` });
    toast.success(`Distributed ${updates.length} orders evenly`); load();
  };

  const selectedCustomerLabel = customerId ? customers.find(c => c.id === customerId)?.name : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Orders</h1><p className="text-sm text-muted-foreground">Manage all orders across channels.</p></div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={distributeRoundRobin}><UserCheck className="h-4 w-4 mr-1" />Auto-distribute</Button>
          <Button variant="outline" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? <><ArchiveRestore className="h-4 w-4 mr-1" />Show Active</> : <><Archive className="h-4 w-4 mr-1" />Show Archived</>}
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Create Order</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create New Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Existing</Button>
                    <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>+ New customer</Button>
                  </div>
                  {mode === "existing" ? (
                    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                          {selectedCustomerLabel || "Search customer by name or phone..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="Search by name or phone..." />
                          <CommandList>
                            <CommandEmpty>No customer found. Switch to "+ New customer".</CommandEmpty>
                            <CommandGroup>
                              {customers.map(c => (
                                <CommandItem key={c.id} value={`${c.name} ${c.phone || ""}`} onSelect={() => { setCustomerId(c.id); setPickerOpen(false); }}>
                                  <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{c.name}</div>
                                    {c.phone && <div className="text-xs text-muted-foreground truncate">{c.phone}</div>}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border p-3">
                      <div><Label className="text-xs">Name *</Label><Input value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} /></div>
                      <div><Label className="text-xs">Phone *</Label><Input value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">Address</Label><Input value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} /></div>
                      <div className="md:col-span-2"><Label className="text-xs">Email</Label><Input type="email" value={newCust.email} onChange={e => setNewCust({ ...newCust, email: e.target.value })} /></div>
                      <p className="text-[11px] text-muted-foreground md:col-span-2">If a customer with this phone already exists, it will be reused.</p>
                    </div>
                  )}
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

        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3 p-3 bg-muted/40 rounded-md">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Set status" /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={bulkApplyStatus} disabled={!bulkStatus}><RefreshCw className="h-3 w-3 mr-1" />Apply</Button>

            <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Assign to staff" /></SelectTrigger>
              <SelectContent>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={bulkAssign} disabled={!bulkAssignee}><UserPlus className="h-3 w-3 mr-1" />Assign</Button>

            {showArchived ? (
              <Button size="sm" variant="outline" onClick={() => bulkArchive(false)}><ArchiveRestore className="h-3 w-3 mr-1" />Restore</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => bulkArchive(true)}><Archive className="h-3 w-3 mr-1" />Archive</Button>
            )}

            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={(v) => toggleAll(!!v)} />
              </TableHead>
              <TableHead>Order #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
              <TableHead>Status</TableHead><TableHead>Assignee</TableHead><TableHead>Units</TableHead><TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No orders found.</TableCell></TableRow> :
              filtered.map(o => {
                const assignee = staff.find(s => s.id === o.assigned_to);
                return (
                  <TableRow key={o.id} data-state={selected.has(o.id) ? "selected" : undefined}>
                    <TableCell><Checkbox checked={selected.has(o.id)} onCheckedChange={(v) => toggleOne(o.id, !!v)} /></TableCell>
                    <TableCell className="font-mono text-xs"><Link to="/orders/$id" params={{ id: o.id }} className="hover:text-primary">{o.order_number || o.id.slice(0, 8)}</Link></TableCell>
                    <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{o.customers?.name || o.customer_name || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                    <TableCell className="text-sm">{assignee?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{o.units}</TableCell>
                    <TableCell>{formatNaira(Number(o.amount))}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
