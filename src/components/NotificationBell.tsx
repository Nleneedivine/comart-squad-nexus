import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notif = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; kind?: string };
type Pref = { in_app: boolean; toast: boolean };

const ALERT_KINDS = new Set(["error", "duplicate", "duplicate_order", "failed_webhook", "parse_error"]);
const isAlert = (k?: string) => !!k && ALERT_KINDS.has(k);
const isNewOrder = (k?: string) => k === "new_order";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    setItems((data as Notif[]) ?? []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    supabase.from("notification_preferences").select("notif_type,in_app,toast").eq("user_id", user.id).then(({ data }) => {
      const m: Record<string, Pref> = {};
      (data ?? []).forEach((r: any) => { m[r.notif_type] = { in_app: r.in_app, toast: r.toast }; });
      setPrefs(m);
    });
    const ch = supabase.channel("notif-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new;
        const kind = n.kind || "info";
        const pref = prefs[kind] ?? { in_app: true, toast: true };
        if (pref.in_app) setItems((prev) => [n, ...prev].slice(0, 30));
        if (pref.toast) toast(n.title, { description: n.body ?? undefined });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const unreadAlerts = items.filter((i) => !i.read_at && isAlert(i.kind)).length;
  const unreadOrders = items.filter((i) => !i.read_at && isNewOrder(i.kind)).length;
  const unreadOther = items.filter((i) => !i.read_at && !isAlert(i.kind) && !isNewOrder(i.kind)).length;
  const totalUnread = unreadAlerts + unreadOrders + unreadOther;

  const markAllRead = async () => {
    if (!user || totalUnread === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  };

  const fallbackLink = (n: Notif): string | null => {
    const k = n.kind || "";
    if (k === "new_order" || k === "duplicate_order" || k === "duplicate") return "/orders";
    if (k === "failed_webhook" || k === "parse_error") return "/webhooks";
    if (k === "payment_event" || k === "wallet") return "/wallet";
    if (k === "integration" || k === "success") return "/integrations";
    if (k === "task") return "/tasks";
    if (k === "chat" || k === "message") return "/chat";
    if (k === "broadcast") return "/admin/broadcasts";
    if (k === "attendance") return "/attendance";
    return null;
  };

  const openNotif = async (n: Notif) => {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i));
    }
    setOpen(false);
    const target = n.link || fallbackLink(n);
    if (target) {
      // Use window.location for max compatibility with dynamic paths like /orders/<uuid>
      window.location.href = target;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 hover:bg-muted rounded-md relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {/* Red badge (errors/duplicates) — priority position */}
          {unreadAlerts > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-600 text-white rounded-full flex items-center justify-center ring-2 ring-background">
              {unreadAlerts > 9 ? "9+" : unreadAlerts}
            </span>
          )}
          {/* Green badge (new orders) — offset when red is present */}
          {unreadOrders > 0 && (
            <span className={cn(
              "absolute min-w-[16px] h-4 px-1 text-[10px] font-bold bg-green-600 text-white rounded-full flex items-center justify-center ring-2 ring-background",
              unreadAlerts > 0 ? "-bottom-0.5 -right-0.5" : "-top-0.5 -right-0.5"
            )}>
              {unreadOrders > 9 ? "9+" : unreadOrders}
            </span>
          )}
          {/* Neutral fallback for other unread kinds */}
          {unreadAlerts === 0 && unreadOrders === 0 && unreadOther > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center ring-2 ring-background">
              {unreadOther > 9 ? "9+" : unreadOther}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadOrders > 0 && <span className="text-[10px] font-semibold bg-green-600 text-white rounded-full px-1.5">{unreadOrders} new</span>}
            {unreadAlerts > 0 && <span className="text-[10px] font-semibold bg-red-600 text-white rounded-full px-1.5">{unreadAlerts} alert</span>}
          </div>
          <button onClick={markAllRead} className="text-xs text-primary hover:underline disabled:opacity-50" disabled={totalUnread === 0}>Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
          )}
          {items.map((n) => {
            const alert = isAlert(n.kind);
            const neworder = isNewOrder(n.kind);
            return (
              <button
                key={n.id}
                onClick={() => openNotif(n)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b last:border-0 text-sm hover:bg-accent transition-colors",
                  !n.read_at && (alert ? "bg-red-50 dark:bg-red-950/20" : neworder ? "bg-green-50 dark:bg-green-950/20" : "bg-primary/5")
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0",
                    n.read_at ? "bg-transparent" : alert ? "bg-red-600" : neworder ? "bg-green-600" : "bg-primary"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
