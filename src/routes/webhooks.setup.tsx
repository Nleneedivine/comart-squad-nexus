import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Webhook, Copy, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/webhooks/setup")({
  head: () => ({ meta: [{ title: "Webhook Setup — Comart+" }, { name: "description", content: "Configure inbound webhooks (WP Forms, Zapier, Make)." }] }),
  component: () => <ProtectedShell><WebhookSetup /></ProtectedShell>,
});

function WebhookSetup() {
  const { store } = useAuth();
  const [secret, setSecret] = useState<string>("");
  const [deliveries, setDeliveries] = useState<any[]>([]);

  const load = async () => {
    if (!store) return;
    const { data: s } = await supabase.from("stores").select("webhook_secret").eq("id", store.id).maybeSingle();
    setSecret((s as any)?.webhook_secret || "");
    const { data: d } = await supabase.from("webhook_deliveries").select("*")
      .eq("store_id", store.id).order("created_at", { ascending: false }).limit(50);
    setDeliveries(d || []);
  };
  useEffect(() => { load(); }, [store]);

  const rotate = async () => {
    if (!store) return;
    const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("stores").update({ webhook_secret: newSecret }).eq("id", store.id);
    if (error) return toast.error(error.message);
    toast.success("Secret rotated");
    load();
  };

  const copy = async (v: string) => {
    try { await navigator.clipboard.writeText(v); toast.success("Copied"); } catch {}
  };

  const url = typeof window !== "undefined" && store
    ? `${window.location.origin}/api/public/wp-forms-webhook?store=${store.id}`
    : "/api/public/wp-forms-webhook";

  const samplePayload = `{
  "name": "Adaeze Okeke",
  "phone": "08012345678",
  "address": "12 Allen Avenue, Ikeja",
  "product": "Bag of rice",
  "quantity": 2,
  "amount": 100000,
  "notes": "Deliver after 3pm"
}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="h-6 w-6 text-primary" />Inbound Webhooks Setup</h1>
        <p className="text-sm text-muted-foreground">Receive orders from WP Forms, Zapier, Make or any external system.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <Label>Endpoint URL</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={url} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(url)}><Copy className="h-4 w-4" /></Button>
          </div>
        </div>
        <div>
          <Label>Signing Secret</Label>
          <div className="flex gap-2 mt-1">
            <Input readOnly value={secret} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(secret)}><Copy className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={rotate}><RefreshCw className="h-4 w-4 mr-1" />Rotate</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Keep secret. Sign every request body with HMAC-SHA256 using this secret and send it as <code className="text-xs">x-comart-signature</code> (hex).
          </p>
        </div>

        <div>
          <Label>Sample payload</Label>
          <pre className="mt-1 p-3 rounded-md bg-muted text-xs overflow-x-auto">{samplePayload}</pre>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">WP Forms setup steps</summary>
          <ol className="list-decimal ml-5 mt-2 space-y-1 text-muted-foreground">
            <li>Install the "WPForms Webhooks" addon (or any HTTP POST integration).</li>
            <li>Set the request URL to the endpoint above.</li>
            <li>Map your form fields to: <code>name</code>, <code>phone</code>, <code>address</code>, <code>product</code>, <code>quantity</code>, <code>amount</code>, <code>notes</code>.</li>
            <li>Configure HMAC-SHA256 signature header <code>x-comart-signature</code> with the signing secret.</li>
            <li>Send a test submission and confirm it appears in the delivery log below.</li>
          </ol>
        </details>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recent deliveries</h2>
        {deliveries.length === 0 ? <p className="text-sm text-muted-foreground">No deliveries yet.</p> : (
          <ul className="divide-y text-sm">
            {deliveries.map(d => (
              <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{d.source} · <Badge variant={d.status === "processed" ? "default" : d.status === "failed" || d.status === "rejected" ? "destructive" : "secondary"}>{d.status}</Badge></div>
                  <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}{d.error ? ` · ${d.error}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
