import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/admin/subscriptions")({
  component: SubsPage,
});

const PLAN_AMOUNT: Record<string, number> = { starter: 5000, growth: 15000, enterprise: 35000 };

function effectiveAmount(r: any) {
  const base = Number(r.amount || 0);
  const v = Number(r.discount_value || 0);
  if (r.discount_type === "waived") return 0;
  if (r.discount_type === "percent") return Math.max(base - (base * v) / 100, 0);
  if (r.discount_type === "fixed") return Math.max(v, 0);
  return base;
}

function SubsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("id,store_id,plan,billing_cycle,status,trial_ends_at,current_period_end,next_billing_at,amount,discount_type,discount_value,discount_note,stores(name)")
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
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3">Store</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Base</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Effective</th>
              <th className="p-3">Trial ends</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
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
                <td className="p-3 text-muted-foreground">{formatNaira(Number(r.amount))}</td>
                <td className="p-3">
                  {r.discount_type === "none" ? <span className="text-muted-foreground">—</span> : (
                    <Badge variant="secondary">
                      {r.discount_type === "waived" && "Waived"}
                      {r.discount_type === "percent" && `${r.discount_value}% off`}
                      {r.discount_type === "fixed" && `Fixed ${formatNaira(Number(r.discount_value))}`}
                    </Badge>
                  )}
                </td>
                <td className="p-3 font-semibold">{formatNaira(effectiveAmount(r))}</td>
                <td className="p-3 text-muted-foreground">{r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}</td>
                <td className="p-3 flex gap-2">
                  <DiscountDialog row={r} onSaved={load} />
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

function DiscountDialog({ row, onSaved }: { row: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(row.discount_type ?? "none");
  const [value, setValue] = useState<string>(String(row.discount_value ?? 0));
  const [note, setNote] = useState<string>(row.discount_note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const v = Number(value) || 0;
    if (type === "percent" && (v < 0 || v > 100)) { toast.error("Percent must be 0–100"); setSaving(false); return; }
    const { error } = await supabase.from("subscriptions").update({
      discount_type: type, discount_value: type === "none" || type === "waived" ? 0 : v, discount_note: note || null,
    }).eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pricing updated");
    setOpen(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Pricing</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust pricing — {row.stores?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pricing type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Standard (full plan price)</SelectItem>
                <SelectItem value="waived">Waived (free)</SelectItem>
                <SelectItem value="percent">Percentage off</SelectItem>
                <SelectItem value="fixed">Fixed amount to pay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === "percent" || type === "fixed") && (
            <div className="space-y-2">
              <Label>{type === "percent" ? "Percent off (0–100)" : "Fixed amount (₦)"}</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Internal note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. partner discount" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
