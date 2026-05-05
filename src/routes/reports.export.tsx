import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV, downloadExcel, downloadPDF } from "@/lib/export";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/reports/export")({
  head: () => ({ meta: [{ title: "Data Export — Comart+" }, { name: "description", content: "Export Orders, Products, Customers, Finance, and Staff to CSV, Excel, or PDF." }] }),
  component: () => <ProtectedShell><DataExport /></ProtectedShell>,
});

type Section = {
  key: string;
  title: string;
  fields: string[];
  fetch: (storeId: string) => Promise<any[][]>;
};

function DataExport() {
  const { store } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const sections: Section[] = [
    {
      key: "orders",
      title: "Orders",
      fields: ["Order #", "Date", "Customer", "Phone", "Email", "Address", "State", "Products", "Status", "Payment", "Total ₦"],
      fetch: async (sid) => {
        const { data: orders } = await supabase.from("orders").select("*, customers(phone,email,address,state), order_items(product_name,quantity)").eq("store_id", sid).order("created_at", { ascending: false });
        return (orders || []).map((o: any) => [
          o.order_number || o.id.slice(0, 8),
          new Date(o.created_at).toLocaleDateString(),
          o.customer_name || "",
          o.customers?.phone || "",
          o.customers?.email || "",
          o.customers?.address || "",
          o.customers?.state || "",
          (o.order_items || []).map((i: any) => `${i.product_name} x${i.quantity}`).join("; "),
          o.status,
          "—",
          o.amount,
        ]);
      },
    },
    {
      key: "products",
      title: "Products",
      fields: ["Name", "SKU", "Category", "Buying Price", "Selling Price", "Stock", "Status"],
      fetch: async (sid) => {
        const { data } = await supabase.from("products").select("*").eq("store_id", sid).order("name");
        return (data || []).map(p => [p.name, p.sku, p.category, p.buying_price, p.selling_price, p.stock_qty, p.status]);
      },
    },
    {
      key: "customers",
      title: "Customers",
      fields: ["Name", "Phone", "Email", "Address", "State", "City", "Total Orders", "Total Spent", "Segment", "Last Order"],
      fetch: async (sid) => {
        const { data: customers } = await supabase.from("customers").select("*").eq("store_id", sid);
        const { data: orders } = await supabase.from("orders").select("customer_id,amount,created_at").eq("store_id", sid);
        return (customers || []).map(c => {
          const co = (orders || []).filter(o => o.customer_id === c.id);
          const total = co.reduce((s, o) => s + Number(o.amount), 0);
          const last = co.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
          const seg = co.length >= 5 ? "VIP" : co.length >= 2 ? "Regular" : "New";
          return [c.name, c.phone, c.email, c.address, c.state, c.city, co.length, total, seg, last ? new Date(last.created_at).toLocaleDateString() : "—"];
        });
      },
    },
    {
      key: "finance",
      title: "Finance Records",
      fields: ["Date", "Type", "Category", "Description", "Amount", "Reference", "Notes"],
      fetch: async (sid) => {
        const { data } = await supabase.from("finance_records").select("*").eq("store_id", sid).order("record_date", { ascending: false });
        return (data || []).map(r => [r.record_date, r.type, r.category, r.description, r.amount, r.source, ""]);
      },
    },
    {
      key: "staff",
      title: "Staff",
      fields: ["Name", "Email", "Role", "Joined"],
      fetch: async (sid) => {
        const { data } = await supabase.from("user_roles").select("role,created_at,user_id,profiles!inner(full_name,email)").eq("store_id", sid);
        return (data || []).map((r: any) => [r.profiles?.full_name, r.profiles?.email, r.role, new Date(r.created_at).toLocaleDateString()]);
      },
    },
  ];

  const run = async (s: Section, fmt: "csv" | "xls" | "pdf") => {
    if (!store) return;
    setBusy(s.key + fmt);
    try {
      const rows = await s.fetch(store.id);
      const name = `${s.key}-${new Date().toISOString().slice(0, 10)}`;
      if (fmt === "csv") downloadCSV(name, s.fields, rows);
      else if (fmt === "xls") downloadExcel(name, s.fields, rows);
      else downloadPDF(s.title, s.fields, rows);
      toast.success(`Exported ${rows.length} ${s.title.toLowerCase()}`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="h-6 w-6 text-primary" />Data Export</h1>
        <p className="text-muted-foreground text-sm mt-1">Export your store data in CSV, Excel or PDF formats.</p>
      </div>

      <div className="grid gap-4">
        {sections.map(s => (
          <Card key={s.key} className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg">{s.title}</h2>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.fields.map(f => <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>)}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" disabled={busy === s.key + "csv"} onClick={() => run(s, "csv")}><FileText className="h-3.5 w-3.5 mr-1.5" />CSV</Button>
                <Button size="sm" variant="outline" disabled={busy === s.key + "xls"} onClick={() => run(s, "xls")}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel</Button>
                <Button size="sm" disabled={busy === s.key + "pdf"} onClick={() => run(s, "pdf")}><FileDown className="h-3.5 w-3.5 mr-1.5" />PDF</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
