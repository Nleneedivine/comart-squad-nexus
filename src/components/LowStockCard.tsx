import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowRight } from "lucide-react";

export default function LowStockCard() {
  const { store } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!store) return;
    supabase.from("products").select("id, name, stock_qty, reorder_point")
      .eq("store_id", store.id).eq("status", "active")
      .then(({ data }) => {
        const low = (data || []).filter((p: any) => Number(p.stock_qty) <= Number(p.reorder_point || 0));
        setRows(low.slice(0, 8));
      });
  }, [store]);

  if (!rows.length) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Low Stock Alerts</h3>
        <Link to="/inventory/products" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map(p => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <Badge variant="destructive" className="shrink-0">{p.stock_qty} left · reorder ≤ {p.reorder_point}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
