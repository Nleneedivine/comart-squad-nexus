import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Plug } from "lucide-react";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ title: "Integration Catalog — Admin" }] }),
  component: AdminIntegrations,
});

function AdminIntegrations() {
  const [rows, setRows] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ key: "", name: "", description: "", monthly_price: 0, is_active: true });
  const [wpStats, setWpStats] = useState<{ active: number; traffic24h: number; traffic7d: number; failed24h: number; wpRow: any | null }>({
    active: 0, traffic24h: 0, traffic7d: 0, failed24h: 0, wpRow: null,
  });

  const load = async () => {
    const { data } = await supabase.from("integration_catalog").select("*").order("name");
    setRows(data || []);
    const { data: req } = await supabase.from("store_integrations")
      .select("*, stores(name)").order("created_at", { ascending: false }).limit(100);
    setRequests(req || []);

    // WPForms metrics
    const wpRow = (data || []).find((r: any) => r.key === "wp_forms") || null;
    const { count: activeCount } = await supabase.from("store_integrations")
      .select("id", { count: "exact", head: true })
      .eq("integration_key", "wp_forms").eq("status", "active");
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: t24 } = await supabase.from("webhook_deliveries")
      .select("id", { count: "exact", head: true }).eq("source", "wp-forms").gte("created_at", since24);
    const { count: t7d } = await supabase.from("webhook_deliveries")
      .select("id", { count: "exact", head: true }).eq("source", "wp-forms").gte("created_at", since7d);
    const { count: failed } = await supabase.from("webhook_deliveries")
      .select("id", { count: "exact", head: true }).eq("source", "wp-forms")
      .in("status", ["failed", "rejected"]).gte("created_at", since24);

    setWpStats({
      active: activeCount ?? 0, traffic24h: t24 ?? 0, traffic7d: t7d ?? 0, failed24h: failed ?? 0, wpRow,
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.key || !form.name) return toast.error("Key and name required");
    const { error } = await supabase.from("integration_catalog")
      .upsert({ ...form, monthly_price: Number(form.monthly_price) }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    setForm({ key: "", name: "", description: "", monthly_price: 0, is_active: true });
    load();
  };

  const togglePrice = async (r: any, value: number) => {
    await supabase.from("integration_catalog").update({ monthly_price: value }).eq("id", r.id);
    load();
  };
  const toggleActive = async (r: any, v: boolean) => {
    await supabase.from("integration_catalog").update({ is_active: v }).eq("id", r.id);
    load();
  };
  const setStatus = async (req: any, status: string) => {
    const patch: any = { status };
    if (status === "active") patch.activated_at = new Date().toISOString();
    await supabase.from("store_integrations").update(patch).eq("id", req.id);
    toast.success(`Set to ${status}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" />Integration Catalog</h1>
          <p className="text-sm text-muted-foreground">Set pricing for integrations and approve store activations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Integration</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Integration</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Key (lowercase, snake)</Label><Input value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} /></div>
              <div><Label>Display Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Monthly price (₦)</Label><Input type="number" value={form.monthly_price} onChange={e => setForm({ ...form, monthly_price: e.target.value })} /></div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Key</th><th>Name</th><th className="text-right">Price ₦/mo</th><th className="text-center">Active</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-mono text-xs">{r.key}</td>
                <td>{r.name}</td>
                <td className="text-right">
                  <Input type="number" defaultValue={r.monthly_price} className="h-8 w-28 ml-auto"
                    onBlur={e => togglePrice(r, Number(e.target.value))} />
                </td>
                <td className="text-center"><Switch checked={r.is_active} onCheckedChange={v => toggleActive(r, v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Activation Requests</h2>
        {requests.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
          <ul className="divide-y text-sm">
            {requests.map(req => (
              <li key={req.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{req.stores?.name || req.store_id} · <span className="font-mono text-xs">{req.integration_key}</span></div>
                  <div className="text-xs text-muted-foreground">Ref: {req.paystack_reference || "—"} · {new Date(req.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={req.status === "active" ? "default" : req.status === "pending" ? "secondary" : "outline"}>{req.status}</Badge>
                  {req.status !== "active" && <Button size="sm" onClick={() => setStatus(req, "active")}>Approve</Button>}
                  {req.status !== "locked" && <Button size="sm" variant="ghost" onClick={() => setStatus(req, "locked")}>Lock</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
