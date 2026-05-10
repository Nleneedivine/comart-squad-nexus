import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Award, CheckCircle2, Clock, Target, TrendingDown, TrendingUp, Truck, XCircle } from "lucide-react";

type Range = "this_week" | "this_month" | "last_month" | "this_year";

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

export default function MyPerformanceCard() {
  const { user, store } = useAuth();
  const [range, setRange] = useState<Range>("this_month");
  const [s, setS] = useState({ assigned: 0, completed: 0, delivered: 0, cancelled: 0, expired: 0, active: 0, rate: 0, deliveryRate: 0 });

  useEffect(() => {
    if (!user || !store) return;
    (async () => {
      const { start, end } = rangeDates(range);
      const [{ data: stats }, { data: active }] = await Promise.all([
        supabase.from("staff_workload_stats").select("*").eq("store_id", store.id).eq("staff_id", user.id).gte("period_start", start).lte("period_start", end),
        supabase.from("orders").select("id").eq("store_id", store.id).eq("assigned_to", user.id).eq("is_archived", false).in("status", ["pending","processing","assigned"]),
      ]);
      const acc = { assigned:0, completed:0, delivered:0, cancelled:0, expired:0, active: active?.length || 0, rate:0, deliveryRate:0 };
      (stats || []).forEach((w: any) => { acc.assigned += w.assigned_count; acc.completed += w.completed_count; acc.delivered += w.delivered_count; acc.cancelled += w.cancelled_count; acc.expired += w.expired_count; });
      const total = acc.completed + acc.cancelled + acc.expired;
      acc.rate = total > 0 ? (acc.completed / total) * 100 : 0;
      acc.deliveryRate = acc.assigned > 0 ? (acc.delivered / acc.assigned) * 100 : 0;
      setS(acc);
    })();
  }, [user, store, range]);

  const rt = rating(s.rate); const Icon = rt.icon;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Award className="h-4 w-4" /> My Performance</h3>
          <p className="text-xs text-muted-foreground">Your stats for the selected period</p>
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
          <Badge variant={rt.variant} className="gap-1"><Icon className="h-3 w-3" />{rt.label}</Badge>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1"><span>Completion Rate</span><span className="font-medium">{s.rate.toFixed(1)}%</span></div>
          <Progress value={s.rate} className="h-2" />
        </div>
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-primary" /> Deliveries</div>
          <div><span className="text-lg font-bold text-primary">{s.delivered}</span><span className="ml-1 text-xs text-muted-foreground">({s.deliveryRate.toFixed(0)}%)</span></div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded bg-muted/50 p-2"><Clock className="h-3 w-3 mx-auto mb-1" /><div className="font-semibold">{s.active}</div><div className="text-muted-foreground">Active</div></div>
          <div className="rounded bg-muted/50 p-2"><CheckCircle2 className="h-3 w-3 mx-auto mb-1 text-primary" /><div className="font-semibold text-primary">{s.completed}</div><div className="text-muted-foreground">Done</div></div>
          <div className="rounded bg-muted/50 p-2"><XCircle className="h-3 w-3 mx-auto mb-1 text-destructive" /><div className="font-semibold text-destructive">{s.cancelled}</div><div className="text-muted-foreground">Cancel</div></div>
          <div className="rounded bg-muted/50 p-2"><Clock className="h-3 w-3 mx-auto mb-1" /><div className="font-semibold">{s.expired}</div><div className="text-muted-foreground">Expired</div></div>
        </div>
      </div>
    </Card>
  );
}
