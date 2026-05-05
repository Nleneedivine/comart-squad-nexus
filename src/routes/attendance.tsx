import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWeekend, isAfter, startOfDay } from "date-fns";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "My Attendance — Comart+" }, { name: "description", content: "Clock in and out and view your monthly attendance." }] }),
  component: () => <ProtectedShell><Attendance /></ProtectedShell>,
});

const LATE_HOUR = 9; // after 9am = late

function Attendance() {
  const { user, store } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date());

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("clock_in", { ascending: false }).limit(200);
    setRecords(data || []);
    setActive((data || []).find(r => !r.clock_out) || null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const clockIn = async () => {
    if (!user || !store) return;
    const { error } = await supabase.from("attendance").insert({ user_id: user.id, store_id: store.id });
    if (error) return toast.error(error.message);
    toast.success("Clocked in"); load();
  };
  const clockOut = async () => {
    if (!active) return;
    const { error } = await supabase.from("attendance").update({ clock_out: new Date().toISOString() }).eq("id", active.id);
    if (error) return toast.error(error.message);
    toast.success("Clocked out"); load();
  };

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const today = startOfDay(new Date());

  const statusFor = (d: Date): "present" | "late" | "absent" | "off" | "future" => {
    if (isAfter(d, today)) return "future";
    if (isWeekend(d)) return "off";
    const rec = records.find(r => isSameDay(new Date(r.clock_in), d));
    if (!rec) return "absent";
    const h = new Date(rec.clock_in).getHours();
    return h >= LATE_HOUR ? "late" : "present";
  };

  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0;
    days.forEach(d => {
      const s = statusFor(d);
      if (s === "present") present++; else if (s === "late") late++; else if (s === "absent") absent++;
    });
    return { present, late, absent };
  }, [days, records]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your clock-in and clock-out activity.</p>
      </div>

      <Card className="p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{active ? "Currently clocked in since" : "You are not clocked in"}</p>
          {active && <p className="font-semibold mt-1">{format(new Date(active.clock_in), "PPp")}</p>}
        </div>
        {active ? <Button onClick={clockOut} variant="destructive">Clock Out</Button> : <Button onClick={clockIn}><Clock className="h-4 w-4 mr-2" />Clock In</Button>}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Present</p><p className="text-2xl font-bold text-emerald-500">{summary.present}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Late</p><p className="text-2xl font-bold text-amber-500">{summary.late}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Absent</p><p className="text-2xl font-bold text-rose-500">{summary.absent}</p></Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{format(month, "MMMM yyyy")}</h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {loading ? <Skeleton className="h-64 w-full" /> : (
          <>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={"e" + i} />)}
              {days.map(d => {
                const s = statusFor(d);
                const cls = {
                  present: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
                  late: "bg-amber-500/15 text-amber-600 border-amber-500/30",
                  absent: "bg-rose-500/15 text-rose-600 border-rose-500/30",
                  off: "bg-muted text-muted-foreground border-border",
                  future: "bg-card text-muted-foreground border-border",
                }[s];
                return (
                  <div key={d.toISOString()} className={cn("aspect-square rounded-md border flex flex-col items-center justify-center text-xs", cls)}>
                    <span className="font-semibold">{format(d, "d")}</span>
                    {s !== "future" && s !== "off" && <span className="text-[10px] capitalize">{s}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Recent History</h2>
        {loading ? <Skeleton className="h-32 w-full" /> : records.length === 0 ? (
          <EmptyState icon={Clock} title="No attendance records yet" description="Clock in to start tracking your attendance." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th>Clock In</th><th>Clock Out</th></tr></thead>
            <tbody>
              {records.slice(0, 15).map(r => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{format(new Date(r.clock_in), "PP")}</td>
                  <td>{format(new Date(r.clock_in), "p")}</td>
                  <td>{r.clock_out ? format(new Date(r.clock_out), "p") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
