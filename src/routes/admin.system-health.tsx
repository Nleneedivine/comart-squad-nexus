import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertOctagon, CreditCard, Webhook, Building2, CheckCircle2, RefreshCw, ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/system-health")({
  head: () => ({ meta: [{ title: "System Health — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: SystemHealthPage,
});

type ErrorRow = {
  id: string;
  store_id: string | null;
  tenant_id: string | null;
  user_id: string | null;
  module: string;
  message: string;
  stack_trace: string | null;
  severity: "critical" | "high" | "medium" | "low" | string;
  status: "open" | "resolved" | "ignored" | string;
  environment: string | null;
  sentry_event_id: string | null;
  metadata: any;
  created_at: string;
  resolved_at: string | null;
};

const sevColor: Record<string, string> = {
  critical: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};
const sevDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const RANGES: Record<string, number> = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3 };

function SystemHealthPage() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [range, setRange] = useState<keyof typeof RANGES>("24h");
  const [severity, setSeverity] = useState<string>("all");
  const [module, setModule] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [stores, setStores] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[range]).toISOString();
    let q = supabase.from("app_errors").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (severity !== "all") q = q.eq("severity", severity);
    if (module !== "all") q = q.eq("module", module);
    if (status !== "all") q = q.eq("status", status);
    const { data } = await q;
    setRows((data as ErrorRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [range, severity, module, status]);

  // Load store names for display
  useEffect(() => {
    const ids = Array.from(new Set(rows.map((r) => r.store_id).filter(Boolean))) as string[];
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !stores[id]);
    if (missing.length === 0) return;
    supabase.from("stores").select("id,name").in("id", missing).then(({ data }) => {
      if (!data) return;
      setStores((prev) => ({ ...prev, ...Object.fromEntries(data.map((s) => [s.id, s.name])) }));
    });
  }, [rows]);

  // Realtime live feed
  useEffect(() => {
    if (!live) return;
    const ch = supabase
      .channel("system-health-errors")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "app_errors" }, (payload) => {
        const r = payload.new as ErrorRow;
        setRows((prev) => [r, ...prev].slice(0, 500));
      })
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "app_errors" }, (payload) => {
        const r = payload.new as ErrorRow;
        setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [live]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.message.toLowerCase().includes(q) ||
      r.module.toLowerCase().includes(q) ||
      (r.store_id || "").toLowerCase().includes(q) ||
      JSON.stringify(r.metadata || {}).toLowerCase().includes(q),
    );
  }, [rows, search]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const critical = rows.filter((r) => r.severity === "critical").length;
    const payments = rows.filter((r) => /billing|payment|paystack|wallet/i.test(r.module + " " + r.message)).length;
    const webhooks = rows.filter((r) => /webhook/i.test(r.module + " " + r.message)).length;
    const bulkImport = rows.filter((r) => /bulk_import/i.test(r.module) || /bulk import|import failed during/i.test(r.message)).length;
    const tenants = new Set(rows.map((r) => r.store_id).filter(Boolean)).size;
    const resolved = rows.filter((r) => r.status === "resolved").length;
    const resolvedPct = total ? Math.round((resolved / total) * 100) : 0;
    return { total, critical, payments, webhooks, bulkImport, tenants, resolvedPct };
  }, [rows]);

  const modules = useMemo(() => Array.from(new Set(rows.map((r) => r.module))).sort(), [rows]);

  async function setRowStatus(id: string, newStatus: "resolved" | "ignored" | "open") {
    const { error } = await supabase.from("app_errors")
      .update({ status: newStatus, resolved_at: newStatus === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked as ${newStatus}`);
    setSelected((s) => (s && s.id === id ? { ...s, status: newStatus } : s));
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-muted-foreground">Real-time platform error monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 bg-background">
            <span className={cn("inline-block h-2 w-2 rounded-full", live ? "bg-red-500 animate-pulse" : "bg-muted-foreground")} />
            <Label htmlFor="live" className="text-sm cursor-pointer">Live feed</Label>
            <Switch id="live" checked={live} onCheckedChange={setLive} />
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <Kpi icon={AlertOctagon} label={`Total (${range})`} value={kpis.total} tone="default" />
        <Kpi icon={AlertTriangle} label="Critical" value={kpis.critical} tone="critical" />
        <Kpi icon={CreditCard} label="Payment failures" value={kpis.payments} tone="critical" />
        <Kpi icon={Webhook} label="Webhook failures" value={kpis.webhooks} tone="high" />
        <Kpi icon={AlertTriangle} label="Bulk import failures" value={kpis.bulkImport} tone="high" />
        <Kpi icon={Building2} label="Affected tenants" value={kpis.tenants} tone="default" />
        <Kpi icon={CheckCircle2} label="Resolved %" value={`${kpis.resolvedPct}%`} tone="ok" />
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search message, tenant, module…" className="pl-8" />
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {/* Error feed */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3 w-[90px]">Severity</th>
              <th className="p-3">Error</th>
              <th className="p-3 w-[120px]">Module</th>
              <th className="p-3 w-[180px]">Tenant</th>
              <th className="p-3 w-[110px]">Status</th>
              <th className="p-3 w-[100px]">When</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                No errors match your filters. The platform is healthy.
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="border-t cursor-pointer hover:bg-accent/40 transition-colors">
                <td className="p-3">
                  <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium uppercase", sevColor[r.severity] || sevColor.low)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", sevDot[r.severity] || sevDot.low)} />
                    {r.severity}
                  </span>
                </td>
                <td className="p-3 max-w-0">
                  <div className="font-medium truncate">{r.message}</div>
                  {r.environment && <div className="text-xs text-muted-foreground">{r.environment}</div>}
                </td>
                <td className="p-3"><Badge variant="outline" className="font-mono text-xs">{r.module}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground truncate max-w-[180px]">
                  {r.store_id ? (stores[r.store_id] || r.store_id.slice(0, 8)) : "—"}
                </td>
                <td className="p-3">
                  <Badge variant={r.status === "resolved" ? "secondary" : r.status === "ignored" ? "outline" : "default"}>
                    {r.status}
                  </Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-block h-2.5 w-2.5 rounded-full", sevDot[selected.severity] || sevDot.low)} />
                  <SheetTitle className="text-lg">{selected.message}</SheetTitle>
                </div>
                <SheetDescription>
                  <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium uppercase mr-2", sevColor[selected.severity] || sevColor.low)}>
                    {selected.severity}
                  </span>
                  <Badge variant="outline" className="font-mono text-xs mr-2">{selected.module}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <Section title="Context">
                  <Field k="Tenant / Store" v={selected.store_id ? `${stores[selected.store_id] || ""} (${selected.store_id})` : "—"} />
                  <Field k="User" v={selected.user_id || "—"} />
                  <Field k="Environment" v={selected.environment || "—"} />
                  <Field k="Status" v={selected.status} />
                  <Field k="Sentry event" v={selected.sentry_event_id || "—"} mono />
                </Section>

                {selected.stack_trace && (
                  <Section title="Stack trace">
                    <pre className="text-xs bg-muted/40 rounded-md p-3 max-h-[260px] overflow-auto whitespace-pre-wrap font-mono">{selected.stack_trace}</pre>
                  </Section>
                )}

                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <Section title="Metadata (sanitized)">
                    <pre className="text-xs bg-muted/40 rounded-md p-3 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </Section>
                )}

                <Section title="Actions">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setRowStatus(selected.id, "resolved")} disabled={selected.status === "resolved"}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark resolved
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRowStatus(selected.id, "ignored")} disabled={selected.status === "ignored"}>
                      Ignore
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRowStatus(selected.id, "open")} disabled={selected.status === "open"}>
                      Reopen
                    </Button>
                    {selected.sentry_event_id && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`https://sentry.io/organizations/sentry/issues/?query=${selected.sentry_event_id}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1.5" /> Open in Sentry
                        </a>
                      </Button>
                    )}
                  </div>
                </Section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: "default" | "critical" | "high" | "ok" }) {
  const toneCls = tone === "critical" ? "text-red-600" : tone === "high" ? "text-orange-600" : tone === "ok" ? "text-emerald-600" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", toneCls)} />
      </div>
      <div className={cn("mt-2 text-2xl font-bold", toneCls)}>{value}</div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-right break-all", mono && "font-mono text-xs")}>{v}</span>
    </div>
  );
}
