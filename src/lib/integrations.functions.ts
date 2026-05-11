import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const PAYSTACK = "https://api.paystack.co";

function key() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return k;
}

export const initIntegrationPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    integration_key: z.string().min(2).max(64),
    email: z.string().email(),
    store_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    // Verify user is admin of the store
    const { data: roles } = await supabase.from("user_roles").select("role")
      .eq("user_id", userId).eq("store_id", data.store_id);
    const isAdmin = (roles || []).some((r: any) => ["owner","admin","manager","head_of_operations"].includes(r.role));
    if (!isAdmin) throw new Error("Only store admins can purchase integrations");

    const { data: cat } = await supabaseAdmin.from("integration_catalog")
      .select("*").eq("key", data.integration_key).eq("is_active", true).maybeSingle();
    if (!cat) throw new Error("Integration not available");
    if (Number(cat.monthly_price) <= 0) throw new Error("This integration has no price set yet");

    const reference = `int_${data.integration_key.slice(0,12)}_${data.store_id.slice(0,8)}_${Date.now()}`;
    const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        amount: Math.round(Number(cat.monthly_price) * 100),
        reference,
        metadata: {
          kind: "integration_purchase",
          store_id: data.store_id,
          integration_key: data.integration_key,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok || json?.status === false) throw new Error(json?.message || "Paystack init failed");

    // upsert pending row
    await supabaseAdmin.from("store_integrations").upsert({
      store_id: data.store_id,
      integration_key: data.integration_key,
      status: "pending",
      paystack_reference: reference,
    }, { onConflict: "store_id,integration_key" });

    return { authorization_url: json.data.authorization_url, reference };
  });
