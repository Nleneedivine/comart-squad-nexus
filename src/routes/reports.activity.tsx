import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/reports/activity")({
  head: () => ({ meta: [{ title: "Store Activity Log — Comart+" }, { name: "description", content: "Audit log of store activity." }] }),
  component: () => <ProtectedShell><ActivityLog /></ProtectedShell>,
});

function ActivityLog() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [type, setType] = useState("all");
  const [user, setUser] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    if (!store) return;
    let q = supabase.from("activity_log").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500);
    if (type !== "all") q = q.eq("type", type);
    if (user !== "all") q = q.eq("user_id", user);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to + "T23:59:59");
    const { data } = await q;
    setRows(data || []);
  };

  const loadStaff = async () => {
    if (!store) return;
    const { data } = await supabase.from("user_roles").select("user_id,profiles!inner(full_name,email)").eq("store_id", store.id);
    const seen = new Set();
    setStaff((data || []).filter((r: any) => !seen.has(r.user_id) && seen.add(r.user_id)));
  };

  useEffect(() => { loadStaff(); }, [store]);
  useEffect(() => { load(); }, [store, type, user, from, to]);

  const types = useMemo(() => Array.from(new Set(rows.map(r => r.type).filter(Boolean))), [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" />Store Activity Log</h1>
        <p className="text-muted-foreground text-sm mt-1">All actions performed across your store.</p>
      </div>

      <Card className="p-4 grid gap-3 md:grid-cols-4">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="All Activities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activities</SelectItem>
            {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {!types.includes("general") && <SelectItem value="general">General</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={user} onValueChange={setUser}>
          <SelectTrigger><SelectValue placeholder="All Staff" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staff.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.profiles?.full_name || s.profiles?.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">S/N</TableHead>
              <TableHead>Action By</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date & Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.user_name || "—"}</TableCell>
                <TableCell>{r.activity}</TableCell>
                <TableCell><Badge variant="secondary">{r.type}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No activity yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
