import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle2, Banknote } from "lucide-react";

export const Route = createFileRoute("/finance/commissions")({
  head: () => ({ meta: [{ title: "Agent Commissions — Comart+" }, { name: "description", content: "Track and pay agent commissions earned on delivered orders." }] }),
  component: () => <ProtectedShell><Commissions /></ProtectedShell>,
});

function Commissions() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const [rows, setRows] = useState<any[]>([]);
  const [agents, setAgents] = useState<Record<string, any>>({});

  const load = async () => {
    if (!store) return;
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from("commissions").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("agents").select("id, name").eq("store_id", store.id),
    ]);
    setRows(c || []);
    const map: Record<string, any> = {};
    (a || []).forEach((x: any) => { map[x.id] = x; });
    setAgents(map);
  };
  useEffect(() => { load(); }, [store]);

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("commissions").update({ status: "paid", paid_at: new Date().toISOString(), paid_by: user?.id }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid"); load();
  };

  const split = (status: string) => rows.filter(r => r.status === status);
  const totalPending = split("pending").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPaid = split("paid").reduce((s, r) => s + Number(r.amount || 0), 0);

  const renderTable = (data: any[]) => (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Date</TableHead><TableHead>Agent</TableHead><TableHead>Order</TableHead>
        <TableHead>Base</TableHead><TableHead>%</TableHead><TableHead>Commission</TableHead>
        <TableHead>Status</TableHead>{isAdmin && <TableHead></TableHead>}
      </TableRow></TableHeader>
      <TableBody>
        {data.length === 0 ? <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-6">No records.</TableCell></TableRow> :
          data.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              <TableCell>{agents[r.agent_id]?.name || r.agent_id.slice(0, 8)}</TableCell>
              <TableCell className="text-xs">{r.order_id.slice(0, 8)}</TableCell>
              <TableCell>{formatNaira(Number(r.base_amount))}</TableCell>
              <TableCell>{Number(r.percent)}%</TableCell>
              <TableCell className="font-semibold text-primary">{formatNaira(Number(r.amount))}</TableCell>
              <TableCell><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              {isAdmin && <TableCell>{r.status === "pending" && <Button size="sm" onClick={() => markPaid(r.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Pay</Button>}</TableCell>}
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6 text-primary" />Agent Commissions</h1>
        <p className="text-sm text-muted-foreground">Auto-calculated when orders are delivered. Mark as paid after disbursement.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-bold text-orange-500">{formatNaira(totalPending)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-2xl font-bold text-emerald-500">{formatNaira(totalPaid)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Records</div><div className="text-2xl font-bold">{rows.length}</div></Card>
      </div>
      <Card className="p-4">
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({split("pending").length})</TabsTrigger>
            <TabsTrigger value="paid">Paid ({split("paid").length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">{renderTable(split("pending"))}</TabsContent>
          <TabsContent value="paid">{renderTable(split("paid"))}</TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
