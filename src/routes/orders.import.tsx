import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Upload, Save, Trash2, FileSpreadsheet, FileText, X } from "lucide-react";
import { parseOrdersAi } from "@/lib/parse-orders.functions";
import { captureError } from "@/lib/sentry";

export const Route = createFileRoute("/orders/import")({
  head: () => ({ meta: [{ title: "Import Orders — Comart+" }, { name: "description", content: "Paste orders or upload spreadsheets/PDFs — AI structures and assigns them." }] }),
  component: BulkImport,
});

type DraftItem = { product_name: string; quantity: number; unit_price?: number; variant?: string };
type Draft = { customer_name: string; phone: string; address?: string; items: DraftItem[]; amount?: number; notes?: string; delivery?: string };
type ImportStep = "upload" | "parse" | "commit";
type ErrorDetails = { step: ImportStep; message: string; at: string } | null;

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as any).message === "string") {
    return (error as any).message;
  }
  return "An unexpected error occurred.";
}

async function extractPdfText(file: File): Promise<string> {
  // @ts-ignore - no types for direct build path
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n";
  }
  return text;
}

async function extractSpreadsheetText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    parts.push(`=== Sheet: ${sheetName} ===`);
    parts.push(XLSX.utils.sheet_to_csv(ws));
  }
  return parts.join("\n");
}

function BulkImport() {
  const { store, user, hydrated, loading } = useAuth();
  const nav = useNavigate();
  const parse = useServerFn(parseOrdersAi);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [files, setFiles] = useState<{ name: string; type: string }[]>([]);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails>(null);

  const reportImportError = (step: ImportStep, error: unknown, extra?: Record<string, unknown>) => {
    const message = normalizeErrorMessage(error);
    setErrorDetails({ step, message, at: new Date().toISOString() });
    captureError(error, {
      tags: { module: "bulk_import", area: "orders", step, severity: step === "commit" ? "high" : "medium" },
      extra: {
        route: "/orders/import",
        storeId: store?.id,
        userId: user?.id,
        uploadedFiles: files.map((f) => f.name),
        draftCount: drafts.length,
        textLength: text.length,
        ...extra,
      },
    });
  };

  useEffect(() => {
    (async () => {
      if (!hydrated || loading || !store) return;
      const { data } = await supabase.from("products").select("name").eq("store_id", store.id).limit(500);
      setProducts((data || []).map((p: any) => p.name));
    })();
  }, [store, hydrated, loading]);

  const handleFiles = async (fileList: FileList) => {
    setBusy(true);
    setErrorDetails(null);
    const added: { name: string; type: string }[] = [];
    let combined = text ? text + "\n\n" : "";
    try {
      for (const f of Array.from(fileList)) {
        if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: too large (max 10MB)`); continue; }
        const lower = f.name.toLowerCase();
        let extracted = "";
        if (lower.endsWith(".pdf")) {
          extracted = await extractPdfText(f);
          added.push({ name: f.name, type: "pdf" });
        } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
          extracted = await extractSpreadsheetText(f);
          added.push({ name: f.name, type: "spreadsheet" });
        } else if (lower.endsWith(".txt") || f.type.startsWith("text/")) {
          extracted = await f.text();
          added.push({ name: f.name, type: "text" });
        } else {
          toast.error(`${f.name}: unsupported format`);
          continue;
        }
        combined += `--- ${f.name} ---\n${extracted}\n\n`;
      }
      if (combined.length > 200000) combined = combined.slice(0, 200000);
      setText(combined);
      setFiles(fs => [...fs, ...added]);
      if (added.length) toast.success(`Extracted ${added.length} file(s) — ready to parse`);
    } catch (e: any) {
      reportImportError("upload", e, { selectedFileCount: fileList.length });
      toast.error(`Extraction failed: ${normalizeErrorMessage(e)}`);
    } finally { setBusy(false); }
  };

  const runParse = async () => {
    if (!hydrated || loading || !user) return toast.error("Please wait for your session to finish loading");
    if (!store) return toast.error("Your workspace is still loading. Try again in a moment.");
    if (!text.trim()) return toast.error("Paste text or upload a file first");
    setBusy(true);
    setErrorDetails(null);
    try {
      const { orders } = await parse({ data: { text, products } });
      if (!orders.length) { toast.error("AI couldn't find any orders"); return; }
      setDrafts(orders);
      toast.success(`Parsed ${orders.length} order(s) — review below`);
    } catch (e: any) {
      reportImportError("parse", e, { productCatalogCount: products.length });
      toast.error(normalizeErrorMessage(e) || "Parse failed");
    } finally { setBusy(false); }
  };

  const updateDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts(d => d.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeDraft = (i: number) => setDrafts(d => d.filter((_, idx) => idx !== i));
  const computeAmount = (d: Draft) =>
    d.amount ?? d.items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0);

  const commit = async () => {
    if (!store || !user) return;
    if (!drafts.length) return toast.error("Nothing to import");
    setBusy(true);
    setErrorDetails(null);
    let ok = 0, fail = 0;
    let firstFailure: { message: string; customer?: string; phone?: string; index: number } | null = null;
    for (const d of drafts) {
      try {
        let customerId: string | null = null;
        if (d.phone) {
          const { data: existing } = await supabase.from("customers")
            .select("id").eq("store_id", store.id).eq("phone", d.phone).maybeSingle();
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
        const noteParts = [d.notes, d.delivery && `Delivery: ${d.delivery}`].filter(Boolean);
        const { data: order, error: oErr } = await supabase.from("orders").insert({
          store_id: store.id, customer_id: customerId, customer_name: d.customer_name,
          amount, units, notes: noteParts.join(" | ") || null, created_by: user.id, status: "pending",
        }).select("id").single();
        if (oErr) throw oErr;
        if (d.items.length) {
          await supabase.from("order_items").insert(d.items.map(it => ({
            store_id: store.id, order_id: order.id,
            product_name: it.variant ? `${it.product_name} (${it.variant})` : it.product_name,
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            subtotal: Number(it.unit_price || 0) * Number(it.quantity || 1),
          })));
        }
        ok++;
      } catch (error) {
        fail++;
        if (!firstFailure) {
          firstFailure = {
            message: normalizeErrorMessage(error),
            customer: d.customer_name,
            phone: d.phone,
            index: ok + fail,
          };
        }
      }
    }
    if (ok) {
      await supabase.from("activity_log").insert({
        store_id: store.id, user_id: user.id, type: "order",
        activity: `Imported ${ok} order(s) via AI parser; auto-assigned by store rules`,
      });
    }
    setBusy(false);
    if (firstFailure) {
      reportImportError("commit", new Error(firstFailure.message), {
        failedCount: fail,
        successfulCount: ok,
        failedDraftIndex: firstFailure.index,
        failedCustomer: firstFailure.customer,
        failedPhone: firstFailure.phone,
      });
    }
    toast.success(`Imported ${ok} order(s)${fail ? ` · ${fail} failed` : ""} · auto-assignment triggered`);
    if (ok) nav({ to: "/orders" });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Import Orders
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste any text or upload spreadsheets (.xlsx, .xls, .csv) and PDFs — AI structures them and auto-assigns to staff.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold">How tenants use bulk import</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Paste raw order text or upload a spreadsheet, CSV, TXT, or PDF export from WhatsApp, WordPress forms, or another backend.</li>
          <li>Click <span className="font-medium text-foreground">Parse with AI</span> to convert it into structured orders matched against your store product catalog.</li>
          <li>Review the drafted orders below and correct names, phones, items, quantities, prices, or addresses if needed.</li>
          <li>Click <span className="font-medium text-foreground">Commit all</span> to save the orders into your store. Auto-assignment then follows your store rules.</li>
        </ol>
        {(!hydrated || loading || !store) && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Preparing your workspace for AI import… if this takes too long, head back to <Link to="/orders" className="text-primary underline-offset-4 hover:underline">Orders</Link> and return once your account finishes loading.
          </div>
        )}
        {errorDetails && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <div className="font-semibold text-destructive">Import failed during {errorDetails.step}</div>
            <p className="mt-1 text-foreground break-words">{errorDetails.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Logged for system health at {new Date(errorDetails.at).toLocaleString()}.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label className="text-base font-semibold">Paste or upload</Label>
          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-1 cursor-pointer text-primary hover:underline">
              <Upload className="h-4 w-4" /> Upload files
              <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.txt,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)} />
            </label>
          </div>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pl-2">
                {f.type === "spreadsheet" ? <FileSpreadsheet className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                {f.name}
                <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <Textarea rows={12}
          placeholder={`Paste any order text here — WhatsApp messages, spreadsheet rows, WordPress form submissions...\n\nExample:\nAdaeze 08012345678 - 2 bags rice @ 50000, 1 oil @ 12000. Lekki Phase 1.\nBola 09011112222 - shoe x1, total 25k, deliver Saturday`}
          value={text} onChange={e => setText(e.target.value)} />

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-muted-foreground">
            {products.length > 0 && `${products.length} products in catalog — AI will match imported items.`}
          </p>
          <Button onClick={runParse} disabled={busy || !text.trim()}>
            <Sparkles className="h-4 w-4 mr-1" />{busy ? "Working…" : "Parse with AI"}
          </Button>
        </div>
      </Card>

      {drafts.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Review {drafts.length} order(s)</h2>
            <Button onClick={commit} disabled={busy}>
              <Save className="h-4 w-4 mr-1" />Commit all
            </Button>
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
                        <TableCell>
                          <Input value={it.variant ? `${it.product_name} (${it.variant})` : it.product_name} onChange={e => {
                            const items = [...d.items]; items[j] = { ...it, product_name: e.target.value, variant: undefined }; updateDraft(i, { items });
                          }} />
                        </TableCell>
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
                  <Button variant="ghost" size="sm" onClick={() => removeDraft(i)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Discard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
