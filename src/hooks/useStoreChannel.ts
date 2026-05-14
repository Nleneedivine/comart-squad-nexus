import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Handler = (payload: any) => void;

export type ChannelHealth = "connecting" | "open" | "closed" | "error";

interface Options {
  storeId: string | null | undefined;
  /** Stable channel name; will be suffixed with storeId */
  name: string;
  /** Map of postgres_changes filters → handler */
  on?: Array<{
    event: "INSERT" | "UPDATE" | "DELETE" | "*";
    table: string;
    handler: Handler;
  }>;
  /** Optional broadcast handler */
  broadcast?: Record<string, Handler>;
  enabled?: boolean;
}

/**
 * Tenant-scoped realtime subscription with auto-reconnect, dedupe, and health.
 * - Always filters every postgres_changes binding by `store_id=eq.{storeId}`.
 * - Dedupes by `${name}:${storeId}` so multiple consumers share one channel.
 * - Cleans up on unmount and on auth state change.
 */
export function useStoreChannel({ storeId, name, on = [], broadcast = {}, enabled = true }: Options) {
  const [health, setHealth] = useState<ChannelHealth>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !storeId) return;
    const channelName = `${name}:${storeId}`;
    const ch = supabase.channel(channelName);
    channelRef.current = ch;

    on.forEach((b) => {
      ch.on(
        "postgres_changes" as any,
        { event: b.event, schema: "public", table: b.table, filter: `store_id=eq.${storeId}` },
        (payload) => b.handler(payload),
      );
    });

    Object.entries(broadcast).forEach(([event, handler]) => {
      ch.on("broadcast", { event }, ({ payload }) => handler(payload));
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") setHealth("open");
      else if (status === "CLOSED") setHealth("closed");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setHealth("error");
      else setHealth("connecting");
    });

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      supabase.removeChannel(ch);
    });

    return () => {
      sub.subscription.unsubscribe();
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, name, enabled]);

  return { health };
}
