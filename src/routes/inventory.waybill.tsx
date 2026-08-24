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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useRowSelection, SelectAllHead, SelectCell, BulkDeleteBar } from "@/components/BulkDelete";


const ADMIN_ROLES = ["owner", "admin", "manager", "head_of_operations"];

export const Route = createFileRoute("/inventory/waybill")({
  head: () => ({ meta: [{ title: "Waybill — Comart+" }, { name: "description", content: "Generate and print waybill documents." }] }),
  component: () => <ProtectedShell><Waybill /></ProtectedShell>,
});

function Waybill() {
  const { store, roles } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r));

  const remove = async (w: any) => {
    if (!confirm(`Delete waybill ${w.waybill_number}?`)) return;
    const { error } = await supabase.from("waybills").delete().eq("id", w.id);
    if (error) return toast.error(error.message);
    toast.success("Waybill deleted"); load();
  };
  const [form, setForm] = useState<any>({ waybill_number: "WB-" + Date.now().toString(36).toUpperCase(), recipient_name: "", recipient_phone: "", recipient_address: "", destination: "", items_text: "", dispatched_by: "", dispatch_date: new Date().toISOString().slice(0, 10), notes: "" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("waybills").select("*").eq("store_id", store.id).order("dispatch_date", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    if (!form.recipient_name) return toast.error("Recipient name required");
    const items = form.items_text.split("\n").filter((l: string) => l.trim()).map((line: string) => ({ description: line.trim() }));
    const { error } = await supabase.from("waybills").insert({
      store_id: store.id, waybill_number: form.waybill_number, recipient_name: form.recipient_name,
      recipient_phone: form.recipient_phone, recipient_address: form.recipient_address, destination: form.destination,
      items, dispatched_by: form.dispatched_by, dispatch_date: form.dispatch_date, notes: form.notes,
    });
    if (error) return toast.error(error.message);
    toast.success("Waybill created"); setOpen(false);
    setForm({ ...form, waybill_number: "WB-" + Date.now().toString(36).toUpperCase(), recipient_name: "", recipient_phone: "", recipient_address: "", destination: "", items_text: "", notes: "" });
    load();
  };

  const print = (w: any) => {
    const html = `<html><head><title>${w.waybill_number}</title><style>body{font-family:sans-serif;padding:40px;color:#111}h1{color:#1D9E75}.row{margin:8px 0}.lbl{font-weight:600;display:inline-block;width:140px}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body>
      <h1>WAYBILL</h1><div class="row"><span class="lbl">Waybill #:</span>${w.waybill_number}</div>
      <div class="row"><span class="lbl">Date:</span>${new Date(w.dispatch_date).toLocaleDateString()}</div>
      <div class="row"><span class="lbl">Recipient:</span>${w.recipient_name}</div>
      <div class="row"><span class="lbl">Phone:</span>${w.recipient_phone || "—"}</div>
      <div class="row"><span class="lbl">Address:</span>${w.recipient_address || "—"}</div>
      <div class="row"><span class="lbl">Destination:</span>${w.destination || "—"}</div>
      <div class="row"><span class="lbl">Dispatched By:</span>${w.dispatched_by || "—"}</div>
      <table><thead><tr><th>#</th><th>Item Description</th></tr></thead><tbody>
      ${(w.items || []).map((it: any, i: number) => `<tr><td>${i + 1}</td><td>${it.description}</td></tr>`).join("")}
      </tbody></table>${w.notes ? `<p style="margin-top:20px"><strong>Notes:</strong> ${w.notes}</p>` : ""}
      <p style="margin-top:60px">_____________________<br/>Signature</p>
      <script>window.print()</script></body></html>`;
    const win = window.open("", "_blank"); if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Waybill</h1><p className="text-sm text-muted-foreground">Generate and print waybill documents.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Waybill</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Waybill</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Waybill #</Label><Input value={form.waybill_number} onChange={e => setForm({ ...form, waybill_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Recipient Name *</Label><Input value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.recipient_phone} onChange={e => setForm({ ...form, recipient_phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Destination</Label><Input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Address</Label><Textarea value={form.recipient_address} onChange={e => setForm({ ...form, recipient_address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Items (one per line)</Label><Textarea rows={4} value={form.items_text} onChange={e => setForm({ ...form, items_text: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Dispatched By</Label><Input value={form.dispatched_by} onChange={e => setForm({ ...form, dispatched_by: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.dispatch_date} onChange={e => setForm({ ...form, dispatch_date: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {isAdmin && <BulkDeleteBar table="waybills" ids={sel.ids} noun="waybills" onDone={() => { sel.clear(); load(); }} />}
        <Table>
          <TableHeader><TableRow>{isAdmin && <SelectAllHead checked={sel.allChecked} onToggle={sel.toggleAll} />}<TableHead>Waybill #</TableHead><TableHead>Date</TableHead><TableHead>Recipient</TableHead><TableHead>Destination</TableHead><TableHead>Items</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">No waybills yet.</TableCell></TableRow> :
              rows.map(w => (
                <TableRow key={w.id}>
                  {isAdmin && <SelectCell checked={sel.isSelected(w.id)} onToggle={() => sel.toggle(w.id)} />}
                  <TableCell className="font-mono text-xs">{w.waybill_number}</TableCell>

                  <TableCell>{new Date(w.dispatch_date).toLocaleDateString()}</TableCell>
                  <TableCell>{w.recipient_name}</TableCell>
                  <TableCell>{w.destination || "—"}</TableCell>
                  <TableCell>{(w.items || []).length}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => print(w)}><Printer className="h-3 w-3 mr-1" />Print</Button>
                      {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(w)} title="Delete waybill"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
