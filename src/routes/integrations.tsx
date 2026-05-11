import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plug, Lock, Sparkles, CheckCircle2 } from "lucide-react";
import { initIntegrationPurchase } from "@/lib/integrations.functions";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Comart+" }, { name: "description", content: "Connect Comart+ to other tools and services." }] }),
  component: () => <ProtectedShell><Integrations /></ProtectedShell>,
});

function Integrations() {
  const { store, user } = useAuth();
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<any[]>([]);
  const [activations, setActivations] = useState<Record<string, any>>({});
  const [picked, setPicked] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const purchase = useServerFn(initIntegrationPurchase);

  const load = async () => {
    const { data: cat } = await supabase.from("integration_catalog").select("*").eq("is_active", true).order("name");
    setCatalog(cat || []);
    if (store) {
      const { data: act } = await supabase.from("store_integrations").select("*").eq("store_id", store.id);
      const m: Record<string, any> = {};
      (act || []).forEach((a: any) => { m[a.integration_key] = a; });
      setActivations(m);
    }
  };
  useEffect(() => { load(); }, [store]);

  const filtered = useMemo(
    () => catalog.filter(i => (i.name + " " + (i.description || "")).toLowerCase().includes(q.toLowerCase())),
    [catalog, q]
  );

  const upgrade = async () => {
    if (!picked || !store || !user) return;
    setBusy(true);
    try {
      const r = await purchase({ data: { integration_key: picked.key, email: user.email!, store_id: store.id } });
      window.location.href = r.authorization_url;
    } catch (e: any) {
      toast.error(e.message || "Could not start checkout");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" />Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">Extend Comart+ with paid integrations. Activated by your super admin once payment is received.</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search integrations..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(i => {
          const act = activations[i.key];
          const status = act?.status || "locked";
          return (
            <Card key={i.key} className="p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground shrink-0">
                  <Plug className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-1.5">
                    {i.name}
                    {status === "active" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                     status === "pending" ? <Badge variant="secondary" className="text-[10px]">Pending</Badge> :
                     <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">₦{Number(i.monthly_price).toLocaleString()}/mo</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{i.description}</p>
              <Button className="mt-4 w-full" variant={status === "active" ? "secondary" : "outline"}
                disabled={status === "active"}
                onClick={() => setPicked(i)}>
                {status === "active" ? "Active" : status === "pending" ? "Awaiting approval" : (<><Sparkles className="h-4 w-4 mr-2" />Upgrade to Activate</>)}
              </Button>
            </Card>
          );
        })}
        {filtered.length === 0 && <Card className="p-12 text-center text-muted-foreground md:col-span-3">No integrations match your search.</Card>}
      </div>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Activate {picked?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{picked?.description}</p>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Price</div>
              <div className="text-2xl font-bold">₦{Number(picked?.monthly_price || 0).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/month</span></div>
            </div>
            <p className="text-xs text-muted-foreground">You'll be redirected to Paystack to complete payment. Once received, your super admin activates the integration for your store.</p>
            <Button className="w-full" onClick={upgrade} disabled={busy}>{busy ? "Starting…" : "Pay with Paystack"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
