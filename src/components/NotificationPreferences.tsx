import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const NOTIF_TYPES = [
  { key: "info", label: "General info", description: "App updates, announcements" },
  { key: "order", label: "Order updates", description: "New orders, status changes" },
  { key: "finance", label: "Finance alerts", description: "Payments, payouts, low balance" },
  { key: "inventory", label: "Inventory alerts", description: "Low stock, faulty stock" },
  { key: "staff", label: "Staff & chat", description: "Mentions, invites, messages" },
];

type Pref = { notif_type: string; in_app: boolean; toast: boolean; email: boolean };

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).then(({ data }) => {
      const m: Record<string, Pref> = {};
      NOTIF_TYPES.forEach(t => { m[t.key] = { notif_type: t.key, in_app: true, toast: true, email: false }; });
      (data ?? []).forEach((r: any) => { m[r.notif_type] = r; });
      setPrefs(m); setLoading(false);
    });
  }, [user]);

  const update = async (type: string, patch: Partial<Pref>) => {
    if (!user) return;
    const next = { ...prefs[type], ...patch };
    setPrefs((p) => ({ ...p, [type]: next }));
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id, notif_type: type, in_app: next.in_app, toast: next.toast, email: next.email,
    }, { onConflict: "user_id,notif_type" });
    if (error) toast.error(error.message);
  };

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 px-4 py-3 bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <div>Type</div><div className="text-center">In-app</div><div className="text-center">Toast</div><div className="text-center">Email</div>
      </div>
      {NOTIF_TYPES.map((t) => (
        <div key={t.key} className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 px-4 py-3 border-t">
          <div>
            <div className="font-medium text-sm">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.description}</div>
          </div>
          <div className="flex justify-center"><Switch checked={prefs[t.key]?.in_app ?? true} onCheckedChange={(v) => update(t.key, { in_app: v })} /></div>
          <div className="flex justify-center"><Switch checked={prefs[t.key]?.toast ?? true} onCheckedChange={(v) => update(t.key, { toast: v })} /></div>
          <div className="flex justify-center"><Switch checked={prefs[t.key]?.email ?? false} onCheckedChange={(v) => update(t.key, { email: v })} /></div>
        </div>
      ))}
      <div className="px-4 py-3 text-xs text-muted-foreground border-t bg-muted/20">
        Email notifications require an email sender domain to be configured.
      </div>
    </Card>
  );
}
