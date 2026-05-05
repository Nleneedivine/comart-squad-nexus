import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Download, TrendingUp, TrendingDown, Wallet as WalletIcon, FileText } from "lucide-react";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finance — Comart+" }, { name: "description", content: "Track income, expenses and profit in ₦." }] }),
  component: () => <ProtectedShell><Finance /></ProtectedShell>,
});

const CATS = ["Sales", "Service", "Salary", "Rent", "Utilities", "Inventory Purchase", "Marketing", "Transport", "Other"];

function Finance() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [form, setForm] = useState<any>({
    record_date: new Date().toISOString().slice(0, 10),
    type: "income", category: "Sales", description: "", amount: "", source: "",
  });

  const load = async () => {
    if (!store) return;
    let q = supabase.from("finance_records").select("*").eq("store_id", store.id).order("record_date", { ascending: false });
    if (from) q = q.gte("record_date", from);
    if (to) q = q.lte("record_date", to);
    if (typeFilter !== "all") q = q.eq("type", typeFilter);
    const { data } = await q;
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store, from, to, typeFilter]);

  const totals = useMemo(() => {
    const inc = rows.filter(r => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const exp = rows.filter(r => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
    return { inc, exp, profit: inc - exp, count: rows.length };
  }, [rows]);

  const save = async () => {
    if (!store) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("finance_records").insert({
      store_id: store.id, record_date: form.record_date, type: form.type,
      category: form.category, description: form.description, amount: amt, source: form.source,
    });
    if (error) return toast.error(error.message);
    toast.success("Record added");
    setOpen(false);
    setForm({ ...form, description: "", amount: "", source: "" });
    load();
  };

  const exportCsv = () => {
    const header = ["Date", "Type", "Category", "Description", "Source", "Amount"];
    const lines = [header.join(",")].concat(rows.map(r => [
      r.record_date, r.type, r.category || "", `"${(r.description || "").replace(/"/g, '""')}"`,
      `"${(r.source || "").replace(/"/g, '""')}"`, r.amount,
    ].join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `finance-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Finance</h1><p className="text-sm text-muted-foreground">Income, expenses and profit ledger.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Record</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Financial Record</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.record_date} onChange={e => setForm({ ...form, record_date: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Type</Label>
                    <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Source / Reference</Label><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></div>
                </div>
                <Button onClick={save} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={TrendingUp} label="Total Income" value={formatNaira(totals.inc)} tone="text-emerald-500" />
        <Kpi icon={TrendingDown} label="Total Expenses" value={formatNaira(totals.exp)} tone="text-rose-500" />
        <Kpi icon={WalletIcon} label="Gross Profit" value={formatNaira(totals.profit)} tone="text-primary" />
        <Kpi icon={FileText} label="Total Records" value={String(totals.count)} tone="text-foreground" />
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-1.5 min-w-[160px]"><Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
          </Select>
        </div>
        <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setTypeFilter("all"); }}>Clear</Button>
      </Card>

      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records yet.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.record_date}</TableCell>
                  <TableCell><Badge variant={r.type === "income" ? "default" : "secondary"}>{r.type}</Badge></TableCell>
                  <TableCell>{r.category || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.description || "—"}</TableCell>
                  <TableCell>{r.source || "—"}</TableCell>
                  <TableCell className={"text-right font-medium " + (r.type === "income" ? "text-emerald-500" : "text-rose-500")}>
                    {r.type === "income" ? "+" : "−"}{formatNaira(Number(r.amount))}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={"h-9 w-9 rounded-md bg-muted flex items-center justify-center " + tone}><Icon className="h-4 w-4" /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold">{value}</p></div>
      </div>
    </Card>
  );
}
