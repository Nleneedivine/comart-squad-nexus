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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/call-orders")({
  head: () => ({ meta: [{ title: "Call Orders — Comart+" }, { name: "description", content: "Log and track call-pipeline orders." }] }),
  component: () => <ProtectedShell><CallOrders /></ProtectedShell>,
});

const STATUSES: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "delivered", label: "Delivered" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "dead", label: "Dead" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT: Record<string, any> = {
  confirmed: "secondary", delivered: "default", rescheduled: "outline", dead: "destructive", cancelled: "destructive",
};

type Row = {
  id: string; order_date: string; agent_name: string | null; agent_user_id: string | null;
  call_received: boolean; call_valid: boolean; status: string;
  bottles_sold: number; bottles_paid: number; amount_remitted: number; notes: string | null;
};

const blank = () => ({
  order_date: new Date().toISOString().slice(0, 10),
  agent_user_id: "" as string,
  call_received: true,
  call_valid: true,
  status: "confirmed",
  bottles_sold: 0,
  bottles_paid: 0,
  amount_remitted: 0,
  notes: "",
});

function CallOrders() {
  const { store, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [staff, setStaff] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>(blank());

  const load = async () => {
    if (!store) return;
    const { data } = await (supabase as any)
      .from("call_orders")
      .select("*")
      .eq("store_id", store.id)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    setRows((data as Row[]) || []);
    const { data: m } = await supabase.rpc("get_store_members_detail", { _store_id: store.id });
    setStaff((m || []).map((r: any) => ({ user_id: r.user_id, full_name: r.full_name })));
  };
  useEffect(() => { load(); }, [store]);

  const openNew = () => { setEditing(null); setForm(blank()); setOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      order_date: r.order_date,
      agent_user_id: r.agent_user_id || "",
      call_received: r.call_received,
      call_valid: r.call_valid,
      status: r.status,
      bottles_sold: r.bottles_sold,
      bottles_paid: r.bottles_paid,
      amount_remitted: Number(r.amount_remitted),
      notes: r.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!store || !user) return;
    const agent = staff.find(s => s.user_id === form.agent_user_id);
    const payload = {
      store_id: store.id,
      order_date: form.order_date,
      agent_user_id: form.agent_user_id || null,
      agent_name: agent?.full_name || null,
      call_received: !!form.call_received,
      call_valid: !!form.call_valid,
      status: form.status,
      bottles_sold: Number(form.bottles_sold) || 0,
      bottles_paid: Number(form.bottles_paid) || 0,
      amount_remitted: Number(form.amount_remitted) || 0,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await (supabase as any).from("call_orders").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Order updated");
    } else {
      const { error } = await (supabase as any).from("call_orders").insert({ ...payload, created_by: user.id });
      if (error) return toast.error(error.message);
      toast.success("Order logged");
    }
    setOpen(false); load();
  };

  const remove = async (r: Row) => {
    if (!confirm("Delete this order?")) return;
    const { error } = await (supabase as any).from("call_orders").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  const totals = useMemo(() => ({
    count: rows.length,
    delivered: rows.filter(r => r.status === "delivered").length,
    bottles: rows.reduce((s, r) => s + (r.bottles_sold || 0), 0),
    remitted: rows.reduce((s, r) => s + Number(r.amount_remitted || 0), 0),
  }), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Call Orders</h1>
          <p className="text-sm text-muted-foreground">Log calls and track each order through the pipeline.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Log New Order</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Order" : "New Order"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Agent / Staff</Label>
                  <Select value={form.agent_user_id} onValueChange={v => setForm({ ...form, agent_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>{staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name || s.user_id.slice(0,6)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-md border px-3 py-2"><Label className="m-0">Call Received</Label><Switch checked={form.call_received} onCheckedChange={v => setForm({ ...form, call_received: v })} /></div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2"><Label className="m-0">Call Valid</Label><Switch checked={form.call_valid} onCheckedChange={v => setForm({ ...form, call_valid: v })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Bottles Sold</Label><Input type="number" min={0} value={form.bottles_sold} onChange={e => setForm({ ...form, bottles_sold: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Bottles Paid</Label><Input type="number" min={0} value={form.bottles_paid} onChange={e => setForm({ ...form, bottles_paid: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Amount Remitted ₦</Label><Input type="number" min={0} value={form.amount_remitted} onChange={e => setForm({ ...form, amount_remitted: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={save} className="w-full">{editing ? "Save Changes" : "Record Order"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Orders</p><p className="text-lg font-bold">{totals.count}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Delivered</p><p className="text-lg font-bold">{totals.delivered}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Bottles Sold</p><p className="text-lg font-bold">{totals.bottles}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Amount Remitted</p><p className="text-lg font-bold">{formatNaira(totals.remitted)}</p></Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 px-2">Order Log</h2>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Agent</TableHead><TableHead>Call</TableHead><TableHead>Valid</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Remitted</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No orders yet.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.order_date).toLocaleDateString()}</TableCell>
                  <TableCell>{r.agent_name || "—"}</TableCell>
                  <TableCell>{r.call_received ? "Yes" : "No"}</TableCell>
                  <TableCell>{r.call_valid ? "Yes" : "No"}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status] || "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">{r.bottles_sold}</TableCell>
                  <TableCell className="text-right">{r.bottles_paid}</TableCell>
                  <TableCell className="text-right font-medium">{formatNaira(Number(r.amount_remitted))}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
