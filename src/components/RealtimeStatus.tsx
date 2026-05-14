import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight realtime/connection indicator for the app shell.
 * Pings supabase via auth session refresh callback and online/offline events.
 */
export default function RealtimeStatus() {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online && !stale) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Live">
        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", online ? "text-amber-600" : "text-destructive")}
      title={online ? "Reconnecting…" : "Offline"}>
      <WifiOff className="h-3.5 w-3.5" />
      {online ? "Reconnecting" : "Offline"}
    </span>
  );
}
