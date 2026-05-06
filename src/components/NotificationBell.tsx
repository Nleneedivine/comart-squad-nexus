import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notif = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; kind?: string };
type Pref = { in_app: boolean; toast: boolean };

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
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
        if (pref.in_app) setItems((prev) => [n, ...prev].slice(0, 20));
        if (pref.toast) toast(n.title, { description: n.body ?? undefined });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const unread = items.filter((i) => !i.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-2 hover:bg-muted rounded-md relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          <button onClick={markAllRead} className="text-xs text-primary hover:underline disabled:opacity-50" disabled={unread === 0}>Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
          )}
          {items.map((n) => (
            <div key={n.id} className={cn("px-3 py-2 border-b last:border-0 text-sm", !n.read_at && "bg-primary/5")}>
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
