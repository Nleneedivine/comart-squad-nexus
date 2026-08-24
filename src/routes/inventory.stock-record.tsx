import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useRowSelection, SelectAllHead, SelectCell, BulkDeleteBar } from "@/components/BulkDelete";


export const Route = createFileRoute("/inventory/stock-record")({
  head: () => ({ meta: [{ title: "Stock Record — Comart+" }, { name: "description", content: "Full stock movement log." }] }),
  component: () => <ProtectedShell><StockRecord /></ProtectedShell>,
});

const ADMIN_ROLES = ["owner", "admin", "manager", "head_of_operations"];

function StockRecord() {
  const { store, roles } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const sel = useRowSelection(rows);
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r));


  const load = () => {
    if (!store) return;
    supabase.from("stock_movements").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setRows(data || []));
  };
  useEffect(() => { load(); }, [store]);

  const remove = async (r: any) => {
    if (!confirm("Delete this stock movement record? This only removes the log entry — it does not adjust product stock.")) return;
    const { error } = await supabase.from("stock_movements").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Movement deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Stock Record</h1><p className="text-sm text-muted-foreground">Complete stock movement history.</p></div>
      <Card className="p-4">
        {isAdmin && <BulkDeleteBar table="stock_movements" ids={sel.ids} noun="records" onDone={() => { sel.clear(); load(); }} />}
        <Table>
          <TableHeader><TableRow>{isAdmin && <SelectAllHead checked={sel.allChecked} onToggle={sel.toggleAll} />}<TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Qty Change</TableHead><TableHead>Balance</TableHead><TableHead>Reference</TableHead>{isAdmin && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={isAdmin ? 8 : 6} className="text-center py-8 text-muted-foreground">No movements yet.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  {isAdmin && <SelectCell checked={sel.isSelected(r.id)} onToggle={() => sel.toggle(r.id)} />}
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.type}</Badge></TableCell>

                  <TableCell className={r.qty_change >= 0 ? "text-primary" : "text-destructive"}>{r.qty_change > 0 ? "+" : ""}{r.qty_change}</TableCell>
                  <TableCell>{r.balance}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => remove(r)} title="Delete record"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
