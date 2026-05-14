import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Plan = "starter" | "pro" | "business";
export type SubStatus = "trialing" | "active" | "grace_period" | "past_due" | "suspended" | "cancelled";

export interface PlanState {
  plan: Plan;
  status: SubStatus;
  /** True when subscription is in good standing OR within grace period. */
  hasAccess: boolean;
  /** True when feature is available to this plan. */
  can: (feature: FeatureKey) => boolean;
  loading: boolean;
}

export type FeatureKey =
  | "exports"
  | "advanced_analytics"
  | "automations"
  | "integrations"
  | "group_chat"
  | "ai_suggestions"
  | "unlimited_staff";

const FEATURES_BY_PLAN: Record<Plan, FeatureKey[]> = {
  starter: ["ai_suggestions"],
  pro: ["ai_suggestions", "exports", "group_chat", "advanced_analytics"],
  business: [
    "ai_suggestions", "exports", "group_chat", "advanced_analytics",
    "automations", "integrations", "unlimited_staff",
  ],
};

/**
 * Reads the current store's subscription + super-admin overrides via feature_flags.
 * Returns soft-restriction helpers (UI gates), not server-side enforcement.
 */
export function usePlanGate(): PlanState {
  const { store } = useAuth();
  const [plan, setPlan] = useState<Plan>("starter");
  const [status, setStatus] = useState<SubStatus>("trialing");
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [{ data: sub }, { data: flags }] = await Promise.all([
        supabase.from("subscriptions")
          .select("plan, status, discount_type")
          .eq("store_id", store.id)
          .maybeSingle(),
        supabase.from("feature_flags")
          .select("flag_key, enabled")
          .eq("store_id", store.id),
      ]);
      if (cancelled) return;
      if (sub) {
        setPlan((sub.plan as Plan) ?? "starter");
        setStatus((sub.status as SubStatus) ?? "trialing");
        // Waived = treat as full access
        if (sub.discount_type === "waived") {
          setOverrides((o) => new Set([...o, "__waived__"]));
        }
      }
      if (flags) {
        setOverrides((o) => new Set([...o, ...flags.filter((f) => f.enabled).map((f) => f.flag_key)]));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [store?.id]);

  const hasAccess = overrides.has("__waived__")
    || ["trialing", "active", "grace_period"].includes(status);

  const can = (feature: FeatureKey) => {
    if (overrides.has("__waived__")) return true;
    if (overrides.has(feature)) return true;
    if (!hasAccess) return false;
    return FEATURES_BY_PLAN[plan].includes(feature);
  };

  return { plan, status, hasAccess, can, loading };
}
