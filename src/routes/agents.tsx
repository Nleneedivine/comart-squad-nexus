import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Users, Trash2 } from "lucide-react";
import { softDeleteAgent } from "@/lib/whatsapp.functions";


export const Route = createFileRoute("/agents")({
  head: () => ({ meta: [{ title: "Agents — Comart+" }, { name: "description", content: "Manage sales agents and performance." }] }),
  component: () => <ProtectedShell><Agents /></ProtectedShell>,
});

function Agents() {
  const { store, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner", "admin", "manager", "head_of_operations"].includes(r));
  const [rows, setRows] = useState<any[]>([]);
  const [perf, setPerf] = useState<Record<string, { orders: number; revenue: number }>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: "", phone: "", email: "", commission_pct: "5", area: "" });
  const [toDelete, setToDelete] = useState<any>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [needsReassign, setNeedsReassign] = useState<{ count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const delFn = useServerFn(softDeleteAgent);

  const load = async () => {
    if (!store) return;
    const { data: a } = await supabase.from("agents").select("*").eq("store_id", store.id).is("deleted_at", null).order("created_at", { ascending: false });
    setRows(a || []);

    const { data: stocks } = await supabase.from("agent_stocks").select("agent_id, quantity").eq("store_id", store.id);
    const map: Record<string, { orders: number; revenue: number }> = {};
    (stocks || []).forEach(s => {
      if (!s.agent_id) return;
      map[s.agent_id] = map[s.agent_id] || { orders: 0, revenue: 0 };
      map[s.agent_id].orders += 1;
      map[s.agent_id].revenue += Number(s.quantity || 0);
    });
    setPerf(map);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    if (!form.name) return toast.error("Name required");
    const { error } = await supabase.from("agents").insert({
      ...form, store_id: store.id, commission_pct: Number(form.commission_pct) || 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Agent added"); setOpen(false);
    setForm({ name: "", phone: "", email: "", commission_pct: "5", area: "" }); load();
  };

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Agents</h1><p className="text-sm text-muted-foreground">Manage your sales agents.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Agent</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Agent</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Commission %</Label><Input type="number" value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Area</Label><Input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} /></div>
              </div>
              <Button onClick={save} className="w-full">Save Agent</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 max-w-xs"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Users className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Total Agents</p><p className="text-lg font-bold">{total}</p></div></div></Card>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Area</TableHead><TableHead>Commission</TableHead><TableHead>Allocations</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No agents yet.</TableCell></TableRow> :
              rows.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.phone || "—"}</TableCell>
                  <TableCell>{a.email || "—"}</TableCell>
                  <TableCell>{a.area || "—"}</TableCell>
                  <TableCell>{a.commission_pct}%</TableCell>
                  <TableCell>{perf[a.id]?.orders || 0}</TableCell>
                  <TableCell><Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
