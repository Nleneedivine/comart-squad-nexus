import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/admin/subscriptions")({
  component: SubsPage,
});

const PLAN_AMOUNT: Record<string, number> = { starter: 5000, growth: 15000, enterprise: 35000 };

function SubsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("id,store_id,plan,billing_cycle,status,trial_ends_at,current_period_end,amount,stores(name)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Subscriptions</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3">Store</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Cycle</th>
              <th className="p-3">Status</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Trial ends</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-medium">{r.stores?.name ?? "—"}</td>
                <td className="p-3">
                  <Select value={r.plan} onValueChange={(v) => update(r.id, { plan: v, amount: PLAN_AMOUNT[v] ?? r.amount })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 capitalize">{r.billing_cycle}</td>
                <td className="p-3">
                  <Select value={r.status} onValueChange={(v) => update(r.id, { status: v })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trialing">Trialing</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="past_due">Past due</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">{formatNaira(Number(r.amount))}</td>
                <td className="p-3 text-muted-foreground">{r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}</td>
                <td className="p-3">
                  <Button size="sm" variant="outline" onClick={() => update(r.id, { status: "active", trial_ends_at: null })}>Activate</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
