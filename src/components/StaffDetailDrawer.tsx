import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, Clock, XCircle, DollarSign } from "lucide-react";

export interface StaffDetailDrawerProps {
  staffId: string | null;
  staffName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function StaffDetailDrawer({ staffId, staffName, open, onOpenChange }: StaffDetailDrawerProps) {
  const { store } = useAuth();
  const [stats, setStats] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !staffId || !store) return;
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const [s, a, c] = await Promise.all([
        supabase.from("staff_workload_stats").select("*").eq("store_id", store.id).eq("staff_id", staffId).gte("period_start", since).order("period_start"),
        supabase.from("activity_log").select("*").eq("store_id", store.id).eq("user_id", staffId).order("created_at", { ascending: false }).limit(15),
        supabase.from("commissions").select("*").eq("store_id", store.id).eq("agent_id", staffId).order("created_at", { ascending: false }).limit(10),
      ]);
      setStats(s.data || []);
      setActivities(a.data || []);
      setCommissions(c.data || []);
    })();
  }, [open, staffId, store]);

  const max = Math.max(1, ...stats.map(s => s.completed_count || 0));
  const totals = stats.reduce((acc, s) => ({
    completed: acc.completed + (s.completed_count || 0),
    cancelled: acc.cancelled + (s.cancelled_count || 0),
    assigned: acc.assigned + (s.assigned_count || 0),
  }), { completed: 0, cancelled: 0, assigned: 0 });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{staffName || "Staff details"}</SheetTitle></SheetHeader>
        <div className="space-y-5 mt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted p-3"><div className="text-lg font-bold">{totals.assigned}</div><div className="text-xs text-muted-foreground">Assigned (14d)</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-lg font-bold text-primary">{totals.completed}</div><div className="text-xs text-muted-foreground">Completed</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-lg font-bold text-destructive">{totals.cancelled}</div><div className="text-xs text-muted-foreground">Cancelled</div></div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Daily completed (sparkline)</h4>
            <div className="flex items-end gap-1 h-20 bg-muted/40 p-2 rounded">
              {stats.length === 0 ? <span className="text-xs text-muted-foreground self-center">No data</span> :
                stats.map(s => (
                  <div key={s.period_start} title={`${s.period_start}: ${s.completed_count}`}
                    className="flex-1 bg-primary rounded-sm" style={{ height: `${((s.completed_count || 0) / max) * 100}%`, minHeight: 2 }} />
                ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Recent commissions</h4>
            {commissions.length === 0 ? <p className="text-xs text-muted-foreground">No commissions.</p> :
              <ul className="text-sm divide-y">{commissions.map(c => (
                <li key={c.id} className="py-2 flex justify-between"><span>₦{Number(c.amount).toLocaleString()}</span><Badge variant={c.status === "paid" ? "default" : "outline"}>{c.status}</Badge></li>
              ))}</ul>}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock className="h-4 w-4" /> Recent activity</h4>
            {activities.length === 0 ? <p className="text-xs text-muted-foreground">No activity yet.</p> :
              <ul className="text-sm space-y-2 max-h-64 overflow-auto">
                {activities.map(a => (
                  <li key={a.id} className="flex items-start gap-2">
                    {a.type === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5" /> : a.type === "cancelled" ? <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.activity}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
