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
import { Search, Plug, Lock, Sparkles, CheckCircle2, Copy, RefreshCw, Settings2, PlayCircle, FileText, AlertCircle } from "lucide-react";
import { initIntegrationPurchase } from "@/lib/integrations.functions";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Comart+" }, { name: "description", content: "Connect Comart+ to other tools and services." }] }),
  component: () => <ProtectedShell><Integrations /></ProtectedShell>,
});

const WPFORMS_KEY = "wp_forms";
const DEFAULT_MAPPING: Record<string, string> = {
  customer_name: "name",
  phone: "phone",
  address: "address",
  product: "product",
  quantity: "quantity",
  amount: "amount",
  notes: "notes",
};

function webhookUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/public/integrations/wpforms/webhook`;
}

function Integrations() {
  const { store, user } = useAuth();
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<any[]>([]);
  const [activations, setActivations] = useState<Record<string, any>>({});
  const [picked, setPicked] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [wpModal, setWpModal] = useState(false);
  const [mapModal, setMapModal] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(DEFAULT_MAPPING);
  const [testResult, setTestResult] = useState<any>(null);
  const purchase = useServerFn(initIntegrationPurchase);

  const load = async () => {
    const { data: cat } = await supabase.from("integration_catalog").select("*").eq("is_active", true).order("name");
    setCatalog(cat || []);
    if (store) {
      const { data: act } = await supabase.from("store_integrations").select("*").eq("store_id", store.id);
      const m: Record<string, any> = {};
      (act || []).forEach((a: any) => { m[a.integration_key] = a; });
      setActivations(m);
      const wp = m[WPFORMS_KEY];
      if (wp?.settings?.field_mapping) {
        setMapping({ ...DEFAULT_MAPPING, ...wp.settings.field_mapping });
      }
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

  const wpRow = activations[WPFORMS_KEY];

  const generateKey = async () => {
    if (!store) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("generate_integration_api_key", {
        _store_id: store.id, _integration_key: WPFORMS_KEY,
      });
      if (error) throw error;
      toast.success("API key generated");
      await load();
      return data as string;
    } catch (e: any) {
      toast.error(e.message || "Could not generate key");
    } finally { setBusy(false); }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const saveMapping = async () => {
    if (!store || !wpRow) return;
    const { error } = await supabase.from("store_integrations").update({
      settings: { ...(wpRow.settings || {}), field_mapping: mapping },
    }).eq("id", wpRow.id);
    if (error) return toast.error(error.message);
    toast.success("Field mapping saved");
    setMapModal(false);
    load();
  };

  const testConnection = async () => {
    if (!wpRow?.api_key) return toast.error("Generate an API key first");
    setTestResult({ status: "running" });
    try {
      const res = await fetch(webhookUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": wpRow.api_key },
        body: JSON.stringify({
          fields: {
            "1": { name: "name", value: "Test Customer" },
            "2": { name: "phone", value: "08000000000" },
            "3": { name: "product", value: "Test Product" },
            "4": { name: "quantity", value: 1 },
            "5": { name: "amount", value: 1000 },
            "6": { name: "address", value: "Test Address" },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      setTestResult({ status: res.status, body: json });
      if (res.ok) toast.success("Test order created"); else toast.error(json?.error || "Test failed");
      load();
    } catch (e: any) {
      setTestResult({ status: "error", error: e.message });
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" />Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">Extend Comart+ with platform integrations. Paid integrations activate once payment is received.</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search integrations..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(i => {
          const isWp = i.key === WPFORMS_KEY;
          const act = activations[i.key];
          const status = act?.status || (isWp ? "inactive" : "locked");
          const free = Number(i.monthly_price) === 0;

          if (isWp) {
            return (
              <Card key={i.key} className="p-5 flex flex-col md:col-span-2 lg:col-span-3 border-primary/30">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground shrink-0">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      {i.name}
                      <Badge variant={status === "active" ? "default" : status === "pending" ? "secondary" : "outline"}>{status}</Badge>
                      {free && <Badge variant="outline" className="text-[10px]">Free</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{i.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-sm">
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Last webhook</div>
                    <div className="font-medium">{act?.last_webhook_at ? new Date(act.last_webhook_at).toLocaleString() : "Never"}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Orders imported</div>
                    <div className="font-medium">{act?.orders_imported_count ?? 0}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">API key</div>
                    <div className="font-mono text-xs truncate">{act?.api_key ? `${act.api_key.slice(0, 16)}…` : "Not generated"}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <Button onClick={() => setWpModal(true)} variant={act?.api_key ? "secondary" : "default"}>
                    <Plug className="h-4 w-4 mr-2" />{act?.api_key ? "View Setup" : "Connect"}
                  </Button>
                  <Button variant="outline" onClick={generateKey} disabled={busy}>
                    <RefreshCw className="h-4 w-4 mr-2" />{act?.api_key ? "Rotate API Key" : "Generate API Key"}
                  </Button>
                  <Button variant="outline" onClick={() => setMapModal(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />Configure Fields
                  </Button>
                  <Button variant="outline" onClick={testConnection} disabled={!act?.api_key}>
                    <PlayCircle className="h-4 w-4 mr-2" />Test Connection
                  </Button>
                </div>

                {testResult && (
                  <div className="mt-3 rounded-md bg-muted p-3 text-xs">
                    <div className="font-semibold mb-1">Test result · status {testResult.status}</div>
                    <pre className="overflow-auto max-h-40">{JSON.stringify(testResult.body || testResult, null, 2)}</pre>
                  </div>
                )}
              </Card>
            );
          }

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

      {/* Generic upgrade dialog */}
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

      {/* WPForms setup dialog */}
      <Dialog open={wpModal} onOpenChange={setWpModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Connect WPForms</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <Label className="text-xs">Webhook URL</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={webhookUrl()} className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => copy(webhookUrl(), "URL")}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={wpRow?.api_key || "— not generated yet —"} className="font-mono text-xs" />
                {wpRow?.api_key && <Button size="sm" variant="outline" onClick={() => copy(wpRow.api_key, "API key")}><Copy className="h-4 w-4" /></Button>}
                <Button size="sm" onClick={generateKey} disabled={busy}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-1.5 text-xs">
              <div className="font-semibold text-sm">Setup steps</div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Install <strong>WPForms Pro</strong> on your WordPress site.</li>
                <li>Enable the <strong>Webhooks Addon</strong>.</li>
                <li>In your form's webhook settings, paste the <strong>Webhook URL</strong> above.</li>
                <li>Add request header: <code className="px-1 bg-background rounded">x-api-key: {wpRow?.api_key ? `${wpRow.api_key.slice(0,16)}…` : "[your key]"}</code></li>
                <li>Method: <strong>POST</strong>, Format: <strong>JSON</strong>.</li>
                <li>Click <strong>Test Connection</strong> on this page to verify.</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Field mapping dialog */}
      <Dialog open={mapModal} onOpenChange={setMapModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure Field Mapping</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Map the field names from your WPForms form to Comart+ order fields. Leave default if your form uses standard names.</p>
            {Object.entries(DEFAULT_MAPPING).map(([comart, _def]) => (
              <div key={comart} className="grid grid-cols-2 gap-2 items-center">
                <Label className="text-xs capitalize">{comart.replace(/_/g, " ")}</Label>
                <Input value={mapping[comart] ?? ""} placeholder={DEFAULT_MAPPING[comart]}
                  onChange={e => setMapping(m => ({ ...m, [comart]: e.target.value }))} />
              </div>
            ))}
            <Button className="w-full" onClick={saveMapping} disabled={!wpRow}>Save Mapping</Button>
            {!wpRow && <p className="text-xs text-destructive">Generate an API key first to enable mapping.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
