import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Loader2, MessageSquare, Sparkles, Wand2 } from "lucide-react";
import { saveWhatsAppConnection, testWhatsAppConnection, whatsappAiAssist } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/integrations/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp Integration — Comart+" }, { name: "description", content: "Connect and customize WhatsApp Business messaging for your store." }] }),
  component: () => <ProtectedShell><WhatsAppSetup /></ProtectedShell>,
});

const USE_CASES = [
  { key: "order_updates", label: "Order updates & notifications", desc: "Placed, shipped, delivered", defaultBody: "Hi {{customer_name}}, your order #{{order_id}} is now {{status}}. Thanks for shopping with {{store_name}}!" },
  { key: "support", label: "Customer support / live chat", desc: "Two-way inbox", defaultBody: "Hi {{customer_name}}, we've received your message and a support agent from {{store_name}} will respond shortly." },
  { key: "abandoned_cart", label: "Abandoned cart reminders", desc: "Recover lost sales", defaultBody: "Hi {{customer_name}}, you left items in your cart at {{store_name}}. Complete your order here: {{cart_link}}" },
  { key: "marketing", label: "Marketing & promotional broadcasts", desc: "Campaigns to opted-in customers", defaultBody: "Hi {{customer_name}}, {{store_name}} has a special offer for you: {{offer_details}}. Reply STOP to opt out." },
  { key: "appointments", label: "Appointment/booking reminders", desc: "Reduce no-shows", defaultBody: "Hi {{customer_name}}, this is a reminder of your appointment with {{store_name}} on {{appointment_date}}." },
  { key: "payments", label: "Payment reminders/receipts", desc: "Invoice + receipt flow", defaultBody: "Hi {{customer_name}}, your payment of {{amount}} to {{store_name}} for order #{{order_id}} was received. Thank you!" },
];

const VARIABLES = ["customer_name", "order_id", "store_name", "status", "tracking_link", "amount", "cart_link", "appointment_date", "offer_details"];

function fill(body: string) {
  const sample: Record<string, string> = {
    customer_name: "Sarah", order_id: "1042", store_name: "Your Store", status: "shipped",
    tracking_link: "https://track.me/1042", amount: "₦12,500", cart_link: "https://shop.me/cart",
    appointment_date: "Fri 2pm", offer_details: "20% off today only",
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] ?? `{{${k}}}`);
}

function WhatsAppSetup() {
  const { store } = useAuth();
  const [step, setStep] = useState(1);
  const [conn, setConn] = useState<any>(null);
  const [creds, setCreds] = useState({ phone_number_id: "", waba_id: "", access_token: "" });
  const [busy, setBusy] = useState(false);
  const [selectedUses, setSelectedUses] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Record<string, { id?: string; name: string; body: string; language: string }>>({});
  const [activeUse, setActiveUse] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const saveConn = useServerFn(saveWhatsAppConnection);
  const testConn = useServerFn(testWhatsAppConnection);
  const aiAssist = useServerFn(whatsappAiAssist);

  const load = async () => {
    if (!store) return;
    const { data: c } = await (supabase as any).from("whatsapp_integrations").select("*").eq("store_id", store.id).maybeSingle();
    setConn(c);
    if (c) {
      setCreds({ phone_number_id: c.phone_number_id ?? "", waba_id: c.waba_id ?? "", access_token: "" });
    }
    const { data: uc } = await (supabase as any).from("whatsapp_use_cases").select("*").eq("store_id", store.id);
    setSelectedUses((uc || []).filter((r: any) => r.is_active).map((r: any) => r.use_case));
    const { data: tpl } = await (supabase as any).from("whatsapp_templates").select("*").eq("store_id", store.id);
    const map: any = {};
    (tpl || []).forEach((t: any) => { map[t.use_case] = { id: t.id, name: t.name, body: t.body, language: t.language }; });
    setTemplates(map);
  };
  useEffect(() => { load(); }, [store]);

  const connect = async () => {
    if (!store) return;
    setBusy(true);
    try {
      const r: any = await saveConn({ data: { store_id: store.id, ...creds } });
      if (r.status === "connected") toast.success(`Connected: ${r.display_phone_number}`);
      else toast.error(r.last_error || "Connection saved but failed test");
      await load();
      if (r.status === "connected") setStep(2);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const test = async () => {
    if (!store) return;
    setBusy(true);
    try {
      const r: any = await testConn({ data: { store_id: store.id } });
      if (r.ok) toast.success("Connection healthy"); else toast.error(r.error || "Failed");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const toggleUse = (k: string) =>
    setSelectedUses(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);

  const saveUseCases = async () => {
    if (!store) return;
    setBusy(true);
    try {
      for (const uc of USE_CASES) {
        await (supabase as any).from("whatsapp_use_cases").upsert({
          store_id: store.id, use_case: uc.key, is_active: selectedUses.includes(uc.key),
        }, { onConflict: "store_id,use_case" });
        if (selectedUses.includes(uc.key) && !templates[uc.key]) {
          setTemplates(t => ({ ...t, [uc.key]: { name: uc.label, body: uc.defaultBody, language: "en" } }));
        }
      }
      setActiveUse(selectedUses[0] || "");
      setStep(3);
    } finally { setBusy(false); }
  };

  const saveTemplate = async (uc: string) => {
    if (!store) return;
    const t = templates[uc];
    if (!t?.body) return toast.error("Message body required");
    const vars = Array.from(t.body.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]);
    if (t.id) {
      await (supabase as any).from("whatsapp_templates").update({
        name: t.name, body: t.body, language: t.language, variables: vars,
      }).eq("id", t.id);
    } else {
      const { data } = await (supabase as any).from("whatsapp_templates").insert({
        store_id: store.id, use_case: uc, name: t.name, body: t.body, language: t.language, variables: vars,
      }).select().single();
      setTemplates(m => ({ ...m, [uc]: { ...t, id: data?.id } }));
    }
    toast.success("Template saved");
  };

  const insertVar = (uc: string, v: string) =>
    setTemplates(m => ({ ...m, [uc]: { ...m[uc], body: (m[uc]?.body || "") + ` {{${v}}}` } }));

  const runAi = async (action: any, extra: any = {}) => {
    if (!activeUse) return;
    setAiBusy(true);
    try {
      const r: any = await aiAssist({ data: { action, current: templates[activeUse]?.body, prompt: aiPrompt, ...extra } });
      if (r.text) setTemplates(m => ({ ...m, [activeUse]: { ...m[activeUse], body: r.text } }));
    } catch (e: any) { toast.error(e.message); }
    finally { setAiBusy(false); }
  };

  const activate = async () => {
    if (!store) return;
    setBusy(true);
    try {
      for (const uc of selectedUses) if (templates[uc]) await saveTemplate(uc);
      await (supabase as any).from("whatsapp_integrations").update({ status: "connected" }).eq("store_id", store.id);
      toast.success("WhatsApp integration activated");
      await load();
    } finally { setBusy(false); }
  };

  const toggleUseCaseActive = async (uc: string, active: boolean) => {
    if (!store) return;
    await (supabase as any).from("whatsapp_use_cases").upsert({
      store_id: store.id, use_case: uc, is_active: active,
    }, { onConflict: "store_id,use_case" });
    setSelectedUses(s => active ? [...new Set([...s, uc])] : s.filter(x => x !== uc));
  };

  const preview = useMemo(() => activeUse ? fill(templates[activeUse]?.body || "") : "", [activeUse, templates]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/integrations"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="h-6 w-6 text-green-600" />WhatsApp Business</h1>
          <p className="text-sm text-muted-foreground">Connect Meta's WhatsApp Cloud API and configure automated messaging.</p>
        </div>
        {conn && <Badge variant={conn.status === "connected" ? "default" : conn.status === "needs_attention" ? "destructive" : "secondary"}>{conn.status}</Badge>}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {["Connect", "Use Case", "Customize", "Review"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <button onClick={() => setStep(i + 1)} className={`h-7 w-7 rounded-full flex items-center justify-center ${step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-emerald-500 text-white" : "bg-muted"}`}>
              {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </button>
            <span className={step === i + 1 ? "font-semibold" : "text-muted-foreground"}>{label}</span>
            {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Connect your WhatsApp Business account</h2>
          <p className="text-sm text-muted-foreground">Get these from Meta Business Manager → WhatsApp → API Setup. Your token is stored server-side and never displayed after save.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Phone Number ID</Label><Input value={creds.phone_number_id} onChange={e => setCreds(c => ({ ...c, phone_number_id: e.target.value }))} placeholder="1234567890" /></div>
            <div><Label>WhatsApp Business Account ID</Label><Input value={creds.waba_id} onChange={e => setCreds(c => ({ ...c, waba_id: e.target.value }))} placeholder="9876543210" /></div>
          </div>
          <div>
            <Label>Access Token</Label>
            <Input type="password" value={creds.access_token} onChange={e => setCreds(c => ({ ...c, access_token: e.target.value }))} placeholder={conn ? "•••• (saved — enter to replace)" : "EAAG..."} />
          </div>
          {conn?.display_phone_number && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <div>Connected as <b>{conn.verified_name}</b> · {conn.display_phone_number}</div>
              {conn.last_error && <div className="text-destructive text-xs mt-1">{conn.last_error}</div>}
            </div>
          )}
          {conn?.webhook_verify_token && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="font-semibold">Webhook configuration (paste into Meta)</div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">Callback URL:</span> <code className="text-[11px]">{typeof window !== "undefined" ? `${window.location.origin}/api/public/whatsapp/webhook` : ""}</code>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/public/whatsapp/webhook`); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">Verify Token:</span> <code className="text-[11px]">{conn.webhook_verify_token}</code>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(conn.webhook_verify_token); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button></div>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={connect} disabled={busy || !creds.phone_number_id || !creds.waba_id || !creds.access_token}>{busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}{conn ? "Reconnect" : "Connect & Test"}</Button>
            {conn && <Button variant="outline" onClick={test} disabled={busy}>Test Connection</Button>}
            {conn?.status === "connected" && <Button variant="ghost" onClick={() => setStep(2)}>Continue<ArrowRight className="h-4 w-4 ml-1" /></Button>}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Choose your use cases</h2>
          <p className="text-sm text-muted-foreground">Select which messaging flows you want to enable. Each unlocks its message template in the next step.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {USE_CASES.map(uc => (
              <button key={uc.key} onClick={() => toggleUse(uc.key)} className={`text-left rounded-lg border p-4 transition ${selectedUses.includes(uc.key) ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{uc.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{uc.desc}</div>
                  </div>
                  {selectedUses.includes(uc.key) && <CheckCircle2 className="h-5 w-5 text-primary" />}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <Button onClick={saveUseCases} disabled={busy || selectedUses.length === 0}>Continue<ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <Card className="p-3 h-fit">
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Use cases</div>
            <div className="space-y-1">
              {selectedUses.map(uc => {
                const label = USE_CASES.find(u => u.key === uc)?.label || uc;
                return (
                  <button key={uc} onClick={() => setActiveUse(uc)} className={`w-full text-left px-2 py-1.5 rounded text-sm ${activeUse === uc ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>
                );
              })}
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            {activeUse ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{USE_CASES.find(u => u.key === activeUse)?.label}</h3>
                  <Select value={templates[activeUse]?.language || "en"} onValueChange={v => setTemplates(m => ({ ...m, [activeUse]: { ...m[activeUse], language: v } }))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Template Name</Label>
                  <Input value={templates[activeUse]?.name || ""} onChange={e => setTemplates(m => ({ ...m, [activeUse]: { ...m[activeUse], name: e.target.value } }))} />
                </div>
                <div>
                  <Label>Message Body</Label>
                  <Textarea rows={5} value={templates[activeUse]?.body || ""} onChange={e => setTemplates(m => ({ ...m, [activeUse]: { ...m[activeUse], body: e.target.value } }))} />
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-muted-foreground mr-1">Insert:</span>
                    {VARIABLES.map(v => (
                      <button key={v} onClick={() => insertVar(activeUse, v)} className="text-[11px] px-2 py-0.5 rounded border hover:bg-muted">{`{{${v}}}`}</button>
                    ))}
                  </div>
                </div>

                <Card className="p-3 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />AI Assist</div>
                  <div className="flex gap-2">
                    <Input placeholder="Describe a new message..." value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} />
                    <Button size="sm" onClick={() => runAi("generate")} disabled={aiBusy || !aiPrompt}>{aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}Generate</Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {["Friendly", "Professional", "Casual", "Formal"].map(t => (
                      <Button key={t} size="sm" variant="outline" disabled={aiBusy} onClick={() => runAi("tone", { tone: t })}>{t}</Button>
                    ))}
                    <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => runAi("shorten")}>Shorten</Button>
                    <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => runAi("lengthen")}>Lengthen</Button>
                    <Select onValueChange={v => runAi("translate", { language: v })}>
                      <SelectTrigger className="w-32 h-8"><SelectValue placeholder="Translate…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="Portuguese">Portuguese</SelectItem>
                        <SelectItem value="Arabic">Arabic</SelectItem>
                        <SelectItem value="Yoruba">Yoruba</SelectItem>
                        <SelectItem value="Igbo">Igbo</SelectItem>
                        <SelectItem value="Hausa">Hausa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Card>

                <div>
                  <Label>Preview</Label>
                  <div className="mt-1 rounded-lg bg-[#e5ddd5] dark:bg-muted p-4">
                    <div className="ml-auto max-w-sm rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/40 p-3 text-sm whitespace-pre-wrap shadow-sm">{preview || "—"}</div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => saveTemplate(activeUse)}>Save Template</Button>
                    <Button onClick={() => setStep(4)}>Review<ArrowRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                </div>
              </>
            ) : <div className="text-center text-muted-foreground py-10">Select a use case on the left.</div>}
          </Card>
        </div>
      )}

      {step === 4 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Review & Activate</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="text-xs text-muted-foreground">Connected number</div>
              <div className="font-semibold">{conn?.verified_name || "—"}</div>
              <div>{conn?.display_phone_number || "—"}</div>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="text-xs text-muted-foreground">Active use cases</div>
              <div className="font-semibold">{selectedUses.length}</div>
            </div>
          </div>
          <div className="space-y-2">
            {selectedUses.map(uc => (
              <div key={uc} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium text-sm">{USE_CASES.find(u => u.key === uc)?.label}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{templates[uc]?.body}</div>
                </div>
                <Switch defaultChecked onCheckedChange={v => toggleUseCaseActive(uc, v)} />
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <Button onClick={activate} disabled={busy}><CheckCircle2 className="h-4 w-4 mr-1" />Activate Integration</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
