import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Webhook, RefreshCw, Search, CheckCircle2, XCircle, Clock, Activity, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/webhooks")({
  head: () => ({ meta: [{ title: "Webhook Logs — Comart+" }, { name: "description", content: "Outbound webhook events with delivery status." }] }),
  component: () => <ProtectedShell><WebhookLogs /></ProtectedShell>,
});

function WebhookLogs() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data } = await supabase.from("webhook_logs").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [store]);

  const stats = useMemo(() => ({
    total: rows.length,
    success: rows.filter(r => r.status === "success").length,
    failed: rows.filter(r => r.status === "failed").length,
    pending: rows.filter(r => r.status === "pending" || r.status === "retry").length,
  }), [rows]);

  const filtered = useMemo(
    () => rows.filter(r => (r.topic + " " + (r.summary || "")).toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const test = async () => {
    if (!store) return;
    const start = Date.now();
    const { error } = await supabase.from("webhook_logs").insert({
      store_id: store.id,
      topic: "test.ping",
      status: "success",
      summary: "Test webhook fired manually",
      duration_ms: Date.now() - start,
      payload: { test: true, ts: new Date().toISOString() },
    });
    if (error) return toast.error(error.message);
    toast.success("Test webhook recorded");
    load();
  };

  const STATUS_BADGE: Record<string, any> = {
    success: { icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600" },
    failed: { icon: XCircle, cls: "bg-red-500/10 text-red-600" },
    pending: { icon: Clock, cls: "bg-amber-500/10 text-amber-600" },
    retry: { icon: RefreshCw, cls: "bg-amber-500/10 text-amber-600" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="h-6 w-6 text-primary" />Webhook Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">Outbound event delivery history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading && "animate-spin"}`} />Refresh</Button>
          <Button onClick={test}><PlayCircle className="h-4 w-4 mr-2" />Test Webhook</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: stats.total, icon: Activity, color: "text-primary" },
          { label: "Successful", value: stats.success, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600" },
          { label: "Pending Retry", value: stats.pending, icon: Clock, color: "text-amber-600" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{s.label}</span><Icon className={`h-4 w-4 ${s.color}`} /></div>
              <div className="text-2xl font-bold mt-2">{s.value}</div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search topic or summary..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(r => {
              const sb = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
              const Icon = sb.icon;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-sm">{r.topic}</TableCell>
                  <TableCell><Badge className={sb.cls} variant="secondary"><Icon className="h-3 w-3 mr-1" />{r.status}</Badge></TableCell>
                  <TableCell className="text-sm">{r.summary || "—"}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No webhook events recorded.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
