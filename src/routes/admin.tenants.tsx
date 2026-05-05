import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/admin/tenants")({
  component: TenantsPage,
});

function TenantsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: stores } = await supabase.from("stores").select("id,name,owner_id,created_at,contact_email").order("created_at", { ascending: false });
      const { data: subs } = await supabase.from("subscriptions").select("store_id,plan,status,trial_ends_at");
      const subMap = new Map((subs ?? []).map((s: any) => [s.store_id, s]));
      setRows((stores ?? []).map((s: any) => ({ ...s, sub: subMap.get(s.id) })));
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter(r => !q || r.name?.toLowerCase().includes(q.toLowerCase()) || r.contact_email?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-sm text-muted-foreground">{rows.length} stores on the platform</p>
      </div>
      <Input placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Store</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3">Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-muted-foreground">No tenants yet</div>
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 capitalize">{r.sub?.plan ?? "—"}</td>
                <td className="p-3"><StatusBadge status={r.sub?.status} /></td>
                <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-muted-foreground">{r.contact_email ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const variant: any = status === "active" ? "default" : status === "trialing" ? "secondary" : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}
