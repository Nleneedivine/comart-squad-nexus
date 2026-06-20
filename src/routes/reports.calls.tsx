import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { Printer, FileDown } from "lucide-react";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/reports/calls")({
  head: () => ({ meta: [{ title: "Call Reports — Comart+" }, { name: "description", content: "Daily and weekly call/financial reports." }] }),
  component: () => <ProtectedShell><CallReports /></ProtectedShell>,
});

type Row = {
  order_date: string; status: string; call_received: boolean; call_valid: boolean;
  bottles_sold: number; bottles_paid: number; amount_remitted: number;
};

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - day);
  return x;
}

function CallReports() {
  const { store } = useAuth();
  const [day, setDay] = useState(isoDay(new Date()));
  const [weekStart, setWeekStart] = useState(isoDay(mondayOf(new Date())));
  const [dayRows, setDayRows] = useState<Row[]>([]);
  const [weekRows, setWeekRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("call_orders").select("order_date,status,call_received,call_valid,bottles_sold,bottles_paid,amount_remitted")
        .eq("store_id", store.id).eq("order_date", day);
      setDayRows((data as Row[]) || []);
    })();
  }, [store, day]);

  useEffect(() => {
    if (!store) return;
    const start = new Date(weekStart); const end = new Date(start); end.setDate(start.getDate() + 5); // Mon–Sat
    (async () => {
      const { data } = await (supabase as any)
        .from("call_orders").select("order_date,status,call_received,call_valid,bottles_sold,bottles_paid,amount_remitted")
        .eq("store_id", store.id).gte("order_date", isoDay(start)).lte("order_date", isoDay(end));
      setWeekRows((data as Row[]) || []);
    })();
  }, [store, weekStart]);

  const calls = useMemo(() => {
    const count = (pred: (r: Row) => boolean) => dayRows.filter(pred).length;
    return {
      gotten: count(r => r.call_received),
      valid: count(r => r.call_valid),
      confirmed: count(r => r.status === "confirmed"),
      delivered: count(r => r.status === "delivered"),
      rescheduled: count(r => r.status === "rescheduled"),
      dead: count(r => r.status === "dead"),
      cancelled: count(r => r.status === "cancelled"),
    };
  }, [dayRows]);

  const dayFin = useMemo(() => {
    const d = dayRows.filter(r => r.status === "delivered");
    return {
      delivered: d.length,
      sold: d.reduce((s, r) => s + (r.bottles_sold || 0), 0),
      paid: d.reduce((s, r) => s + (r.bottles_paid || 0), 0),
      remitted: d.reduce((s, r) => s + Number(r.amount_remitted || 0), 0),
    };
  }, [dayRows]);

  const weekDays = useMemo(() => {
    const start = new Date(weekStart);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = isoDay(d);
      const delivered = weekRows.filter(r => r.order_date === iso && r.status === "delivered");
      return {
        iso,
        label: d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }),
        delivered: delivered.length,
        sold: delivered.reduce((s, r) => s + (r.bottles_sold || 0), 0),
        paid: delivered.reduce((s, r) => s + (r.bottles_paid || 0), 0),
        remitted: delivered.reduce((s, r) => s + Number(r.amount_remitted || 0), 0),
      };
    });
  }, [weekRows, weekStart]);

  const weekCum = useMemo(() => weekDays.reduce((a, d) => ({
    delivered: a.delivered + d.delivered, sold: a.sold + d.sold, paid: a.paid + d.paid, remitted: a.remitted + d.remitted,
  }), { delivered: 0, sold: 0, paid: 0, remitted: 0 }), [weekDays]);

  const printPage = () => window.print();

  const exportDayCalls = () => downloadCSV(`daily-calls-${day}`,
    ["Metric", "Value"],
    [["Calls Gotten", calls.gotten], ["Valid Calls", calls.valid], ["Confirmed Orders", calls.confirmed],
     ["Delivered Orders", calls.delivered], ["Rescheduled Orders", calls.rescheduled],
     ["Dead Orders", calls.dead], ["Failed/Cancelled Orders", calls.cancelled]]);

  const exportDayFin = () => downloadCSV(`daily-financial-${day}`,
    ["Metric", "Value"],
    [["Orders Delivered", dayFin.delivered], ["Bottles Sold", dayFin.sold],
     ["Bottles Paid For", dayFin.paid], ["Amount Remitted", dayFin.remitted]]);

  const exportWeek = () => downloadCSV(`weekly-financial-${weekStart}`,
    ["Day", "Delivered", "Bottles Sold", "Bottles Paid", "Amount Remitted"],
    [...weekDays.map(d => [d.label, d.delivered, d.sold, d.paid, d.remitted]),
     ["Cumulative", weekCum.delivered, weekCum.sold, weekCum.paid, weekCum.remitted]]);

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Call Reports</h1>
          <p className="text-sm text-muted-foreground">Daily and weekly performance from the call pipeline.</p>
        </div>
      </div>

      <Tabs defaultValue="daily-calls">
        <TabsList className="print:hidden">
          <TabsTrigger value="daily-calls">Daily Calls</TabsTrigger>
          <TabsTrigger value="daily-financial">Daily Financial</TabsTrigger>
          <TabsTrigger value="weekly-financial">Weekly Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="daily-calls">
          <Card className="p-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap print:hidden">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></div>
              <div className="flex-1" />
              <Button variant="outline" onClick={exportDayCalls}><FileDown className="h-4 w-4 mr-1" />Export CSV</Button>
              <Button onClick={printPage}><Printer className="h-4 w-4 mr-1" />Print</Button>
            </div>
            <h2 className="text-lg font-semibold">Daily Calls Report — {new Date(day).toLocaleDateString()}</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Calls Gotten</TableCell><TableCell className="text-right font-medium">{calls.gotten}</TableCell></TableRow>
                <TableRow><TableCell>Valid Calls</TableCell><TableCell className="text-right font-medium">{calls.valid}</TableCell></TableRow>
                <TableRow><TableCell>Confirmed Orders</TableCell><TableCell className="text-right font-medium">{calls.confirmed}</TableCell></TableRow>
                <TableRow><TableCell>Delivered Orders</TableCell><TableCell className="text-right font-medium">{calls.delivered}</TableCell></TableRow>
                <TableRow><TableCell>Rescheduled / Scheduled Orders</TableCell><TableCell className="text-right font-medium">{calls.rescheduled}</TableCell></TableRow>
                <TableRow><TableCell>Dead Orders</TableCell><TableCell className="text-right font-medium">{calls.dead}</TableCell></TableRow>
                <TableRow><TableCell>Failed / Cancelled Orders</TableCell><TableCell className="text-right font-medium">{calls.cancelled}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="daily-financial">
          <Card className="p-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap print:hidden">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></div>
              <div className="flex-1" />
              <Button variant="outline" onClick={exportDayFin}><FileDown className="h-4 w-4 mr-1" />Export CSV</Button>
              <Button onClick={printPage}><Printer className="h-4 w-4 mr-1" />Print</Button>
            </div>
            <h2 className="text-lg font-semibold">Daily Financial Report — {new Date(day).toLocaleDateString()}</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Total Orders Delivered</TableCell><TableCell className="text-right font-medium">{dayFin.delivered}</TableCell></TableRow>
                <TableRow><TableCell>No. of Bottles Sold</TableCell><TableCell className="text-right font-medium">{dayFin.sold}</TableCell></TableRow>
                <TableRow><TableCell>No. of Bottles Paid For</TableCell><TableCell className="text-right font-medium">{dayFin.paid}</TableCell></TableRow>
                <TableRow><TableCell>Amount Remitted</TableCell><TableCell className="text-right font-medium">{formatNaira(dayFin.remitted)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="weekly-financial">
          <Card className="p-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap print:hidden">
              <div className="space-y-1.5"><Label>Week Starting (Monday)</Label><Input type="date" value={weekStart} onChange={e => setWeekStart(isoDay(mondayOf(new Date(e.target.value))))} /></div>
              <div className="flex-1" />
              <Button variant="outline" onClick={exportWeek}><FileDown className="h-4 w-4 mr-1" />Export CSV</Button>
              <Button onClick={printPage}><Printer className="h-4 w-4 mr-1" />Print</Button>
            </div>
            <h2 className="text-lg font-semibold">Weekly Financial Report — week of {new Date(weekStart).toLocaleDateString()}</h2>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Bottles Sold</TableHead>
                <TableHead className="text-right">Bottles Paid</TableHead>
                <TableHead className="text-right">Amount Remitted</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {weekDays.map(d => (
                  <TableRow key={d.iso}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell className="text-right">{d.delivered}</TableCell>
                    <TableCell className="text-right">{d.sold}</TableCell>
                    <TableCell className="text-right">{d.paid}</TableCell>
                    <TableCell className="text-right">{formatNaira(d.remitted)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Cumulative</TableCell>
                  <TableCell className="text-right">{weekCum.delivered}</TableCell>
                  <TableCell className="text-right">{weekCum.sold}</TableCell>
                  <TableCell className="text-right">{weekCum.paid}</TableCell>
                  <TableCell className="text-right">{formatNaira(weekCum.remitted)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
