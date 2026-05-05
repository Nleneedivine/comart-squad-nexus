import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "My Attendance — Comart+" }, { name: "description", content: "Clock in and out and view your attendance history." }] }),
  component: () => <ProtectedShell><Attendance /></ProtectedShell>,
});

function Attendance() {
  const { user, store } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("clock_in", { ascending: false }).limit(30);
    setRecords(data || []);
    setActive((data || []).find(r => !r.clock_out) || null);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your clock-in and clock-out activity.</p>
      </div>
      <Card className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{active ? "Currently clocked in since" : "You are not clocked in"}</p>
          {active && <p className="font-semibold mt-1">{format(new Date(active.clock_in), "PPp")}</p>}
        </div>
        {active ? <Button onClick={clockOut} variant="destructive">Clock Out</Button> : <Button onClick={clockIn}>Clock In</Button>}
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold mb-4">History</h2>
        {records.length === 0 ? <p className="text-sm text-muted-foreground">No records yet</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th>Clock In</th><th>Clock Out</th></tr></thead>
            <tbody>
              {records.map(r => (
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
