import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Award, CheckCircle2, Clock, Download, Target, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import StaffDetailDrawer from "./StaffDetailDrawer";

type Range = "this_week" | "this_month" | "last_month" | "this_year";

interface Row {
  staff_id: string;
  name: string;
  email: string;
  assigned: number;
  completed: number;
  cancelled: number;
  expired: number;
  active: number;
  rate: number;
}

function rangeDates(r: Range): { start: string; end: string } {
  const now = new Date();
  let start: Date;
  switch (r) {
    case "this_week": start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); break;
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) };
    }
    case "this_year": start = new Date(now.getFullYear(), 0, 1); break;
    case "this_month":
    default: start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start: start.toISOString().slice(0,10), end: now.toISOString().slice(0,10) };
}

function rating(rate: number) {
  if (rate >= 90) return { label: "Excellent", variant: "default" as const, icon: Award };
  if (rate >= 75) return { label: "Good", variant: "secondary" as const, icon: TrendingUp };
  if (rate >= 50) return { label: "Average", variant: "outline" as const, icon: Target };
  return { label: "Needs Improvement", variant: "destructive" as const, icon: TrendingDown };
}

export default function StaffPerformanceCard() {
  const { store } = useAuth();
  const [range, setRange] = useState<Range>("this_month");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    if (!store) return;
    (async () => {
      setLoading(true);
      const { start, end } = rangeDates(range);
      const [{ data: members }, { data: stats }, { data: active }] = await Promise.all([
        supabase.rpc("get_store_members_detail", { _store_id: store.id }),
        supabase.from("staff_workload_stats").select("*").eq("store_id", store.id).gte("period_start", start).lte("period_start", end),
        supabase.from("orders").select("assigned_to").eq("store_id", store.id).eq("is_archived", false).in("status", ["pending","processing","shipped"]),
      ]);
      const map: Record<string, Row> = {};
      (members || []).forEach((m: any) => {
        if (m.is_suspended) return;
        if (map[m.user_id]) return;
        map[m.user_id] = {
          staff_id: m.user_id,
          name: m.full_name || m.email || "—",
          email: m.email || "",
          assigned: 0, completed: 0, cancelled: 0, expired: 0, active: 0, rate: 0,
        };
      });
      (active || []).forEach((o: any) => { if (o.assigned_to && map[o.assigned_to]) map[o.assigned_to].active += 1; });
      (stats || []).forEach((s: any) => {
        const r = map[s.staff_id]; if (!r) return;
        r.assigned += s.assigned_count; r.completed += s.completed_count;
        r.cancelled += s.cancelled_count; r.expired += s.expired_count;
      });
      Object.values(map).forEach(r => {
        const total = r.completed + r.cancelled + r.expired;
        r.rate = total > 0 ? (r.completed / total) * 100 : 0;
      });
      setRows(Object.values(map).sort((a,b) => b.rate - a.rate));
      setLoading(false);
    })();
  }, [store, range]);

  const exportCSV = () => {
    const headers = ["Rank","Name","Email","Active","Completed","Cancelled","Expired","Completion Rate"];
    const csv = [headers, ...rows.map((r, i) => [i+1, r.name, r.email, r.active, r.completed, r.cancelled, r.expired, `${r.rate.toFixed(1)}%`])]
      .map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `staff-performance-${range}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Award className="h-4 w-4" /> Staff Performance</h3>
          <p className="text-xs text-muted-foreground">Completion rates and workload</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={exportCSV}><Download className="h-4 w-4" /></Button>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
        rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No staff yet</p> :
        <div className="space-y-3">
          {rows.map((r, i) => {
            const rt = rating(r.rate); const Icon = rt.icon;
            return (
              <div key={r.staff_id} className="rounded-lg bg-muted/40 p-3 space-y-2 cursor-pointer hover:bg-muted/60 transition" onClick={() => setSelected(r)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">#{i+1}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    </div>
                  </div>
                  <Badge variant={rt.variant} className="gap-1 text-xs"><Icon className="h-3 w-3" />{rt.label}</Badge>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1"><span>Completion</span><span className="font-medium">{r.rate.toFixed(0)}%</span></div>
                  <Progress value={r.rate} className="h-1.5" />
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                  <div className="rounded bg-background p-1.5"><div className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" /><span className="font-semibold">{r.active}</span></div><div className="text-[10px] text-muted-foreground">Active</div></div>
                  <div className="rounded bg-background p-1.5"><div className="flex items-center justify-center gap-1 text-primary"><CheckCircle2 className="h-3 w-3" /><span className="font-semibold">{r.completed}</span></div><div className="text-[10px] text-muted-foreground">Done</div></div>
                  <div className="rounded bg-background p-1.5"><div className="flex items-center justify-center gap-1 text-destructive"><XCircle className="h-3 w-3" /><span className="font-semibold">{r.cancelled}</span></div><div className="text-[10px] text-muted-foreground">Cancel</div></div>
                  <div className="rounded bg-background p-1.5"><div className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" /><span className="font-semibold">{r.expired}</span></div><div className="text-[10px] text-muted-foreground">Expired</div></div>
                </div>
              </div>
            );
          })}
        </div>
      }
      <StaffDetailDrawer staffId={selected?.staff_id || null} staffName={selected?.name} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
    </Card>
  );
}
