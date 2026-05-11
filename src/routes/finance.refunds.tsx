import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Undo2, Check, X } from "lucide-react";

export const Route = createFileRoute("/finance/refunds")({
  head: () => ({ meta: [{ title: "Refunds — Comart+" }, { name: "description", content: "Manage refund requests across orders." }] }),
  component: () => <ProtectedShell><Refunds /></ProtectedShell>,
});

function Refunds() {
  const { store, user, roles } = useAuth();
  const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    if (!store) return;
    const { data } = await supabase.from("refunds").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [store]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("refunds").update({
      status, processed_by: user?.id, processed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Refund updated"); load();
  };

  const split = (s: string) => rows.filter(r => r.status === s);

  const renderTable = (data: any[]) => (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Amount</TableHead>
        <TableHead>Reason</TableHead><TableHead>Status</TableHead>{isAdmin && <TableHead></TableHead>}
      </TableRow></TableHeader>
      <TableBody>
        {data.length === 0 ? <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-6">No refunds.</TableCell></TableRow> :
          data.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              <TableCell><Link to="/orders/$id" params={{ id: r.order_id }} className="text-primary hover:underline text-xs">{r.order_id.slice(0, 8)}</Link></TableCell>
              <TableCell className="font-semibold">{formatNaira(Number(r.amount))}</TableCell>
              <TableCell className="text-xs max-w-xs truncate">{r.reason || "—"}</TableCell>
              <TableCell><Badge variant={r.status === "refunded" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
              {isAdmin && <TableCell>
                {r.status === "requested" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "approved")}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}><X className="h-3 w-3" /></Button>
                  </div>
                )}
                {r.status === "approved" && <Button size="sm" onClick={() => setStatus(r.id, "refunded")}>Mark refunded</Button>}
              </TableCell>}
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Undo2 className="h-6 w-6 text-primary" />Refunds</h1>
        <p className="text-sm text-muted-foreground">Review and process refund requests raised from orders.</p>
      </div>
      <Card className="p-4">
        <Tabs defaultValue="requested">
          <TabsList>
            <TabsTrigger value="requested">Requested ({split("requested").length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({split("approved").length})</TabsTrigger>
            <TabsTrigger value="refunded">Refunded ({split("refunded").length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({split("rejected").length})</TabsTrigger>
          </TabsList>
          <TabsContent value="requested">{renderTable(split("requested"))}</TabsContent>
          <TabsContent value="approved">{renderTable(split("approved"))}</TabsContent>
          <TabsContent value="refunded">{renderTable(split("refunded"))}</TabsContent>
          <TabsContent value="rejected">{renderTable(split("rejected"))}</TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
