import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { Calendar, Download } from "lucide-react";

export const Route = createFileRoute("/reports/daily")({
  head: () => ({ meta: [{ title: "Daily Reports — Comart+" }, { name: "description", content: "Daily store performance snapshots, generated automatically." }] }),
  component: () => <ProtectedShell><DailyReports /></ProtectedShell>,
});

function DailyReports() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!store) return;
    supabase.from("daily_report_snapshots").select("*").eq("store_id", store.id)
      .order("report_date", { ascending: false }).limit(60)
      .then(({ data }) => setRows(data || []));
  }, [store]);

  const exportCsv = () => {
    const header = "Date,Orders,Revenue,Delivered,Cancelled,Top Product\n";
    const csv = header + rows.map(r => [r.report_date, r.orders_count, r.revenue, r.delivered_count, r.cancelled_count, JSON.stringify(r.top_product || "")].join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `daily-reports-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6 text-primary" />Daily Reports</h1>
          <p className="text-sm text-muted-foreground">Generated automatically every night at 1:00 UTC.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <Card className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Orders</TableHead><TableHead>Revenue</TableHead>
            <TableHead>Delivered</TableHead><TableHead>Cancelled</TableHead><TableHead>Top Product</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No reports yet. They will appear after the first nightly run.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.report_date}</TableCell>
                  <TableCell>{r.orders_count}</TableCell>
                  <TableCell className="font-semibold text-primary">{formatNaira(Number(r.revenue))}</TableCell>
                  <TableCell>{r.delivered_count}</TableCell>
                  <TableCell>{r.cancelled_count}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{r.top_product || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
