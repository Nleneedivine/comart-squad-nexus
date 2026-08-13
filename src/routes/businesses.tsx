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
import { useRowSelection, SelectAllHead, SelectCell, DeleteRowButton, BulkDeleteBar, deleteRows } from "@/components/BulkDelete";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/businesses")({
  head: () => ({ meta: [{ title: "Businesses — Comart+" }, { name: "description", content: "Manage supplier and vendor businesses." }] }),
  component: () => <ProtectedShell><Businesses /></ProtectedShell>,
});

function Businesses() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ business_name: "", contact_person: "", phone: "", email: "", address: "", category: "" });

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("businesses").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);
  const sel = useRowSelection(rows);

  const save = async () => {
    if (!store) return;
    if (!form.business_name) return toast.error("Business name required");
    const { error } = await supabase.from("businesses").insert({ ...form, store_id: store.id });
    if (error) return toast.error(error.message);
    toast.success("Business added"); setOpen(false);
    setForm({ business_name: "", contact_person: "", phone: "", email: "", address: "", category: "" }); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Businesses</h1><p className="text-sm text-muted-foreground">Suppliers and vendor partners.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Business</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Business</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Business Name *</Label><Input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Address</Label><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <BulkDeleteBar table="businesses" ids={sel.ids} onDone={() => { sel.clear(); load(); }} noun="businesses" />
        <Table>
          <TableHeader><TableRow><SelectAllHead checked={sel.allChecked} onToggle={sel.toggleAll} /><TableHead>Business</TableHead><TableHead>Contact</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Category</TableHead><TableHead className="w-12 text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No businesses yet.</TableCell></TableRow> :
              rows.map(b => (
                <TableRow key={b.id}>
                  <SelectCell checked={sel.isSelected(b.id)} onToggle={() => sel.toggle(b.id)} />
                  <TableCell className="font-medium">{b.business_name}</TableCell>
                  <TableCell>{b.contact_person || "—"}</TableCell>
                  <TableCell>{b.phone || "—"}</TableCell>
                  <TableCell>{b.email || "—"}</TableCell>
                  <TableCell>{b.category || "—"}</TableCell>
                  <TableCell className="text-right"><DeleteRowButton label="Delete this business?" onConfirm={async () => { if (await deleteRows("businesses", [b.id])) { sel.clear(); load(); } }} /></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
