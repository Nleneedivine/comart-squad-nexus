import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { CreditCard, Sparkles, Calendar, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing & Plan — Comart+" }, { name: "description", content: "Your Comart+ subscription, trial status, and next billing date." }] }),
  component: () => <ProtectedShell><BillingPage /></ProtectedShell>,
});

function effective(s: any) {
  const base = Number(s?.amount || 0);
  const v = Number(s?.discount_value || 0);
  if (!s) return 0;
  if (s.discount_type === "waived") return 0;
  if (s.discount_type === "percent") return Math.max(base - (base * v) / 100, 0);
  if (s.discount_type === "fixed") return Math.max(v, 0);
  return base;
}

function BillingPage() {
  const { store } = useAuth();
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store) return;
    supabase.from("subscriptions").select("*").eq("store_id", store.id).maybeSingle()
      .then(({ data }) => { setSub(data); setLoading(false); });
  }, [store]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (!sub) return <Card className="p-6">No subscription found for this store.</Card>;

  const trialMs = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() - Date.now() : 0;
  const trialDays = Math.max(0, Math.ceil(trialMs / 86400000));
  const eff = effective(sub);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground">Your current subscription and upcoming charges.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><Sparkles className="h-3.5 w-3.5" /> Plan</div>
          <div className="text-2xl font-bold capitalize mt-1">{sub.plan}</div>
          <div className="text-xs text-muted-foreground capitalize">{sub.billing_cycle} billing</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><ShieldCheck className="h-3.5 w-3.5" /> Status</div>
          <div className="mt-2"><StatusBadge status={sub.status} /></div>
          {sub.status === "trialing" && (
            <div className="text-xs text-muted-foreground mt-2">{trialDays} day{trialDays === 1 ? "" : "s"} left in trial</div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide"><Calendar className="h-3.5 w-3.5" /> Next billing</div>
          <div className="text-2xl font-bold mt-1">
            {sub.next_billing_at ? new Date(sub.next_billing_at).toLocaleDateString()
              : sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString()
              : "—"}
          </div>
          <div className="text-xs text-muted-foreground">{formatNaira(eff)} due</div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><CreditCard className="h-4 w-4" /> Pricing breakdown</h2>
        <div className="space-y-2 text-sm">
          <Row label={`${sub.plan[0].toUpperCase() + sub.plan.slice(1)} plan (${sub.billing_cycle})`} value={formatNaira(Number(sub.amount))} />
          {sub.discount_type !== "none" && (
            <Row
              label={
                sub.discount_type === "waived" ? "Waived by Comart+ (no charge)"
                : sub.discount_type === "percent" ? `Discount (${sub.discount_value}% off)`
                : `Custom price set by Comart+`
              }
              value={
                sub.discount_type === "waived" ? `−${formatNaira(Number(sub.amount))}`
                : sub.discount_type === "percent" ? `−${formatNaira((Number(sub.amount) * Number(sub.discount_value)) / 100)}`
                : `Set to ${formatNaira(Number(sub.discount_value))}`
              }
              accent
            />
          )}
          <div className="border-t pt-2 mt-2 flex items-center justify-between">
            <span className="font-semibold">You pay</span>
            <span className="text-xl font-bold">{formatNaira(eff)}</span>
          </div>
          {sub.discount_note && <p className="text-xs text-muted-foreground italic">Note: {sub.discount_note}</p>}
        </div>
      </Card>

      <Card className="p-6 text-sm text-muted-foreground bg-muted/20">
        Online payment via Paystack will be enabled soon. For now, please reach out to support to confirm your billing arrangement.
      </Card>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={accent ? "text-primary" : ""}>{label}</span>
      <span className={accent ? "text-primary font-medium" : ""}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = { active: "default", trialing: "secondary", past_due: "destructive", cancelled: "destructive" };
  return <Badge variant={map[status] || "secondary"} className="capitalize">{status.replace("_", " ")}</Badge>;
}
