import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/inventory/stock-record")({
  head: () => ({ meta: [{ title: "Stock Record — Comart+" }, { name: "description", content: "Full stock movement log." }] }),
  component: () => <ProtectedShell><StockRecord /></ProtectedShell>,
});

function StockRecord() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!store) return;
    supabase.from("stock_movements").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setRows(data || []));
  }, [store]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Stock Record</h1><p className="text-sm text-muted-foreground">Complete stock movement history.</p></div>
      <Card className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Qty Change</TableHead><TableHead>Balance</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No movements yet.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.type}</Badge></TableCell>
                  <TableCell className={r.qty_change >= 0 ? "text-primary" : "text-destructive"}>{r.qty_change > 0 ? "+" : ""}{r.qty_change}</TableCell>
                  <TableCell>{r.balance}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
