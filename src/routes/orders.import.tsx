import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Upload, Save, Trash2 } from "lucide-react";
import { parseOrdersAi } from "@/lib/parse-orders.functions";

export const Route = createFileRoute("/orders/import")({
  head: () => ({ meta: [{ title: "Bulk Import Orders — Comart+" }, { name: "description", content: "Paste raw order text and let AI structure it before saving." }] }),
  component: () => <ProtectedShell><BulkImport /></ProtectedShell>,
});

type DraftItem = { product_name: string; quantity: number; unit_price?: number };
type Draft = { customer_name: string; phone: string; address?: string; items: DraftItem[]; amount?: number; notes?: string };

function BulkImport() {
  const { store, user } = useAuth();
  const nav = useNavigate();
  const parse = useServerFn(parseOrdersAi);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const handleFile = async (f: File) => {
    if (f.size > 1024 * 1024) return toast.error("File too large (max 1MB)");
    const t = await f.text();
    setText(t);
  };

  const runParse = async () => {
    if (!text.trim()) return toast.error("Paste or upload some text first");
    setBusy(true);
    try {
      const { orders } = await parse({ data: { text } });
      if (!orders.length) { toast.error("AI couldn't find any orders"); return; }
      setDrafts(orders);
      toast.success(`Parsed ${orders.length} order(s) — review below`);
    } catch (e: any) {
      toast.error(e.message || "Parse failed");
    } finally { setBusy(false); }
  };

  const updateDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts(d => d.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  };

  const removeDraft = (i: number) => setDrafts(d => d.filter((_, idx) => idx !== i));

  const computeAmount = (d: Draft) => d.amount ?? d.items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0);

  const commit = async () => {
    if (!store || !user) return;
    if (!drafts.length) return toast.error("Nothing to import");
    setBusy(true);

    // build round-robin pool: active staff + current open-order counts
    const { data: roleRows } = await supabase.from("user_roles").select("user_id, role, is_suspended").eq("store_id", store.id);
    const targets = Array.from(new Map((roleRows || [])
      .filter((r: any) => !r.is_suspended)
      .map((r: any) => [r.user_id, { id: r.user_id, role: r.role }])).values());
    const counts: Record<string, number> = {};
    for (const t of targets) {
      const { count } = await supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("store_id", store.id).eq("assigned_to", t.id).eq("is_archived", false)
        .in("status", ["pending","processing","shipped"]);
      counts[t.id] = count || 0;
    }
    const pickNext = () => {
      if (targets.length === 0) return null;
      const next = targets.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b);
      counts[next.id] += 1;
      return next.id;
    };

    let ok = 0, fail = 0, assigned = 0;
    for (const d of drafts) {
      try {
        // upsert customer by phone
        let customerId: string | null = null;
        if (d.phone) {
          const { data: existing } = await supabase.from("customers").select("id").eq("store_id", store.id).eq("phone", d.phone).maybeSingle();
          if (existing) customerId = existing.id;
        }
        if (!customerId && d.customer_name) {
          const { data: c, error: cErr } = await supabase.from("customers").insert({
            store_id: store.id, name: d.customer_name, phone: d.phone || "—",
            full_address: d.address || null,
          }).select("id").single();
          if (cErr) throw cErr;
          customerId = c.id;
        }
        const amount = computeAmount(d);
        const units = d.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
        const assignTo = pickNext();
        const { data: order, error: oErr } = await supabase.from("orders").insert({
          store_id: store.id, customer_id: customerId, customer_name: d.customer_name,
          amount, units, notes: d.notes || null, created_by: user.id, status: "pending",
          assigned_to: assignTo, assigned_at: assignTo ? new Date().toISOString() : null,
        }).select("id").single();
        if (oErr) throw oErr;
        if (assignTo) assigned++;
        if (d.items.length) {
          await supabase.from("order_items").insert(d.items.map(it => ({
            store_id: store.id, order_id: order.id,
            product_name: it.product_name, quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            subtotal: Number(it.unit_price || 0) * Number(it.quantity || 1),
          })));
        }
        ok++;
      } catch { fail++; }
    }
    if (ok) {
      await supabase.from("activity_log").insert({
        store_id: store.id, user_id: user.id, type: "order",
        activity: `Bulk imported ${ok} order(s); ${assigned} auto-assigned via round-robin`,
      });
    }
    setBusy(false);
    toast.success(`Imported ${ok} order(s)${assigned ? ` · ${assigned} auto-assigned` : ""}${fail ? ` · ${fail} failed` : ""}`);
    if (ok) nav({ to: "/orders" });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> Bulk Import Orders</h1>
        <p className="text-sm text-muted-foreground">Paste raw orders (WhatsApp messages, notes, CSV-ish text) and let AI structure them.</p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label>Raw text</Label>
          <label className="text-xs flex items-center gap-1 cursor-pointer text-primary hover:underline">
            <Upload className="h-3.5 w-3.5" /> Upload .txt/.csv
            <input type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </div>
        <Textarea rows={10} placeholder="e.g.&#10;Adaeze 08012345678 - 2 bags rice @ 50000, 1 oil @ 12000. Lekki Phase 1.&#10;Bola 09011112222 - shoe x1, total 25k" value={text} onChange={e => setText(e.target.value)} />
        <div className="flex justify-end">
          <Button onClick={runParse} disabled={busy}><Sparkles className="h-4 w-4 mr-1" />{busy ? "Parsing…" : "Parse with AI"}</Button>
        </div>
      </Card>

      {drafts.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Review {drafts.length} order(s)</h2>
            <Button onClick={commit} disabled={busy}><Save className="h-4 w-4 mr-1" />Commit all</Button>
          </div>
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><Label className="text-xs">Customer</Label><Input value={d.customer_name} onChange={e => updateDraft(i, { customer_name: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={d.phone} onChange={e => updateDraft(i, { phone: e.target.value })} /></div>
                  <div><Label className="text-xs">Address</Label><Input value={d.address || ""} onChange={e => updateDraft(i, { address: e.target.value })} /></div>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="w-20">Qty</TableHead><TableHead className="w-32">Unit ₦</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.items.map((it, j) => (
                      <TableRow key={j}>
                        <TableCell><Input value={it.product_name} onChange={e => {
                          const items = [...d.items]; items[j] = { ...it, product_name: e.target.value }; updateDraft(i, { items });
                        }} /></TableCell>
                        <TableCell><Input type="number" value={it.quantity} onChange={e => {
                          const items = [...d.items]; items[j] = { ...it, quantity: Number(e.target.value) }; updateDraft(i, { items });
                        }} /></TableCell>
                        <TableCell><Input type="number" value={it.unit_price ?? 0} onChange={e => {
                          const items = [...d.items]; items[j] = { ...it, unit_price: Number(e.target.value) }; updateDraft(i, { items });
                        }} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">₦{computeAmount(d).toLocaleString()}</span></span>
                  <Button variant="ghost" size="sm" onClick={() => removeDraft(i)}><Trash2 className="h-3.5 w-3.5 mr-1" />Discard</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
