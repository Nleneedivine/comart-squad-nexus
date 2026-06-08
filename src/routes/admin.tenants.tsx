import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Trash2, Gift, Clock, CheckCircle2, XCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/tenants")({
  component: TenantsPage,
});

function TenantsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [detailStore, setDetailStore] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("superadmin_list_tenants");
    if (error) {
      console.error("tenants load error", error);
      toast.error(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const deleteTenant = async (id: string, name: string) => {
    if (confirmText !== name) return toast.error("Type the store name to confirm");
    const { error } = await supabase.rpc("superadmin_delete_store", { _store_id: id });
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${name}`);
    setConfirmText("");
    load();
  };

  const filtered = rows.filter(r =>
    !q ||
    r.name?.toLowerCase().includes(q.toLowerCase()) ||
    r.contact_email?.toLowerCase().includes(q.toLowerCase()) ||
    r.owner_email?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-sm text-muted-foreground">{rows.length} stores on the platform</p>
      </div>
      <Input placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Store</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Staff</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Subscription</th>
              <th className="p-3">Store status</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="p-10 text-center">
                <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-muted-foreground">No tenants yet</div>
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.id?.slice(0,8)}…</div>
                </td>
                <td className="p-3">
                  <div>{r.owner_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.owner_email || "—"}</div>
                </td>
                <td className="p-3 text-muted-foreground">
                  <div>{r.contact_email || "—"}</div>
                  <div className="text-xs">{r.contact_phone || "—"}</div>
                </td>
                <td className="p-3">{r.staff_count ?? 0}</td>
                <td className="p-3 capitalize">{r.plan ?? "—"}</td>
                <td className="p-3"><StatusBadge status={r.sub_status} /></td>
                <td className="p-3">
                  <Badge variant={r.status === "active" ? "default" : r.status === "suspended" ? "destructive" : "outline"}>
                    {r.status || "—"}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setDetailStore(r)} title="Manage">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog onOpenChange={(o) => { if (!o) setConfirmText(""); }}>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete tenant permanently?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes <strong>{r.name}</strong> and all of its data: orders, customers, products, staff roles, invites, finance records, etc. This cannot be undone.
                            <br /><br />Type the store name <code className="bg-muted px-1">{r.name}</code> to confirm.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={r.name} />
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTenant(r.id, r.name)}>
                            Delete tenant
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <TenantDetailDialog store={detailStore} onClose={() => setDetailStore(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const variant: any = status === "active" ? "default" : status === "trialing" ? "secondary" : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

// ---------- Tenant detail + Feature Access Overrides ----------

function TenantDetailDialog({ store, onClose }: { store: any | null; onClose: () => void }) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!store) return;
    const [{ data: cat }, { data: ovs }] = await Promise.all([
      supabase.from("integration_catalog").select("*").eq("is_active", true).order("name"),
      supabase.from("feature_overrides").select("*").eq("store_id", store.id),
    ]);
    setCatalog(cat || []);
    const m: Record<string, any> = {};
    (ovs || []).forEach((o: any) => { m[o.feature_key] = o; });
    setOverrides(m);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store?.id]);

  const saveOverride = async (feature_key: string, patch: Partial<any>) => {
    if (!store) return;
    setBusy(true);
    const existing = overrides[feature_key];
    const payload: any = {
      store_id: store.id,
      feature_key,
      is_active: patch.is_active ?? existing?.is_active ?? true,
      start_at: patch.start_at ?? existing?.start_at ?? new Date().toISOString(),
      expires_at: patch.expires_at !== undefined ? patch.expires_at : existing?.expires_at ?? null,
      notes: patch.notes !== undefined ? patch.notes : existing?.notes ?? null,
    };
    const { error } = existing
      ? await supabase.from("feature_overrides").update(payload).eq("id", existing.id)
      : await supabase.from("feature_overrides").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Override saved");
    load();
  };

  const removeOverride = async (id: string) => {
    const { error } = await supabase.from("feature_overrides").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Override removed");
    load();
  };

  const summary = useMemo(() => {
    const now = Date.now();
    let active = 0, expired = 0;
    Object.values(overrides).forEach((o: any) => {
      const exp = o.expires_at ? new Date(o.expires_at).getTime() : Infinity;
      if (o.is_active && exp > now) active++;
      else if (exp <= now) expired++;
    });
    return { active, expired };
  }, [overrides]);

  return (
    <Dialog open={!!store} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {store?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Active free features</div>
              <div className="text-2xl font-bold flex items-center gap-2"><Gift className="h-5 w-5 text-emerald-500" />{summary.active}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Expired overrides</div>
              <div className="text-2xl font-bold flex items-center gap-2"><XCircle className="h-5 w-5 text-muted-foreground" />{summary.expired}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Tenant ID</div>
              <div className="text-xs font-mono break-all mt-1">{store?.id}</div>
            </Card>
          </div>

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Gift className="h-4 w-4" />Feature Access Overrides</h3>
            <p className="text-xs text-muted-foreground mb-3">Grant temporary free access to paid features. Existing billing/subscription rules are not modified — this is an additive override layer.</p>
            <div className="space-y-3">
              {catalog.filter((c: any) => Number(c.monthly_price) > 0).map((c: any) => {
                const ov = overrides[c.key];
                const expiresMs = ov?.expires_at ? new Date(ov.expires_at).getTime() : null;
                const isLive = ov?.is_active && (!expiresMs || expiresMs > Date.now());
                const daysLeft = expiresMs ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 86_400_000)) : null;
                return (
                  <Card key={c.key} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {c.name}
                          {isLive && <Badge variant="default" className="bg-emerald-600">Free Access ON</Badge>}
                          {ov && !isLive && expiresMs && expiresMs <= Date.now() && <Badge variant="outline">Expired</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">₦{Number(c.monthly_price).toLocaleString()}/mo · key <code>{c.key}</code></div>
                        {daysLeft !== null && isLive && (
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />{daysLeft} day{daysLeft === 1 ? "" : "s"} remaining
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`tog-${c.key}`} className="text-xs">Free Access</Label>
                        <Switch
                          id={`tog-${c.key}`}
                          checked={!!isLive}
                          disabled={busy}
                          onCheckedChange={(checked) => saveOverride(c.key, { is_active: checked, start_at: new Date().toISOString() })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Start date</Label>
                        <Input
                          type="date"
                          value={ov?.start_at ? new Date(ov.start_at).toISOString().slice(0,10) : ""}
                          onChange={(e) => saveOverride(c.key, { start_at: e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString() })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Expiry date</Label>
                        <Input
                          type="date"
                          value={ov?.expires_at ? new Date(ov.expires_at).toISOString().slice(0,10) : ""}
                          onChange={(e) => saveOverride(c.key, { expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        rows={2}
                        placeholder="Reason for free access (e.g. partner, trial extension)…"
                        defaultValue={ov?.notes ?? ""}
                        onBlur={(e) => {
                          if ((ov?.notes ?? "") !== e.target.value) saveOverride(c.key, { notes: e.target.value });
                        }}
                      />
                    </div>
                    {ov && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeOverride(ov.id)}>
                          Remove override
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
              {catalog.filter((c: any) => Number(c.monthly_price) > 0).length === 0 && (
                <Card className="p-6 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
                  No paid features in the catalog yet.
                </Card>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
