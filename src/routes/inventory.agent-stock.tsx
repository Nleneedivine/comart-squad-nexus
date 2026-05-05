import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/inventory/agent-stock")({
  head: () => ({ meta: [{ title: "Agent Stock Table — Comart+" }, { name: "description", content: "Stock allocated to your agents." }] }),
  component: () => <ProtectedShell><AgentStock /></ProtectedShell>,
});

function AgentStock() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ agent_id: "", product_id: "", quantity: 1 });

  const load = async () => {
    if (!store) return;
    const [{ data: r }, { data: roles }, { data: p }] = await Promise.all([
      supabase.from("agent_stocks").select("*").eq("store_id", store.id).order("allocated_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, profiles(full_name)").eq("store_id", store.id),
      supabase.from("products").select("id, name").eq("store_id", store.id),
    ]);
    setRows(r || []);
    const uniq = new Map();
    (roles || []).forEach((row: any) => uniq.set(row.user_id, row.profiles?.full_name || "Unknown"));
    setAgents(Array.from(uniq.entries()).map(([id, name]) => ({ id, name })));
    setProducts(p || []);
  };
  useEffect(() => { load(); }, [store]);

  const save = async () => {
    if (!store) return;
    const a = agents.find(x => x.id === form.agent_id); const p = products.find(x => x.id === form.product_id);
    if (!a || !p) return toast.error("Select agent and product");
    const { error } = await supabase.from("agent_stocks").insert({ store_id: store.id, agent_id: a.id, agent_name: a.name, product_id: p.id, product_name: p.name, quantity: form.quantity });
    if (error) return toast.error(error.message);
    toast.success("Stock allocated"); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Agent Stock Table</h1><p className="text-sm text-muted-foreground">Stock allocated to each agent.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Allocate Stock</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Allocate Stock to Agent</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Agent</Label>
                <Select value={form.agent_id} onValueChange={v => setForm({ ...form, agent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Product</Label>
                <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
              <Button onClick={save} className="w-full">Allocate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Agent</TableHead><TableHead>Product</TableHead><TableHead>Quantity</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No allocations yet.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.allocated_at).toLocaleDateString()}</TableCell>
                  <TableCell>{r.agent_name || "—"}</TableCell>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell>{r.quantity}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
