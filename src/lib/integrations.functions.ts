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


const fieldMappingSchema = z.object({
  customer_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(120).optional(),
  product: z.string().trim().min(1).max(120).optional(),
  quantity: z.string().trim().min(1).max(120).optional(),
  amount: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().min(1).max(120).optional(),
});

async function requireIntegrationManager(
  storeId: string,
  supabase: typeof supabaseAdmin,
  userId: string,
) {
  const { data: allowed, error } = await supabase.rpc("has_permission", {
    _store_id: storeId,
    _permission: "integrations.manage",
  });
  if (error || !allowed) {
    throw new Error("You do not have permission to manage integrations");
  }
  return userId;
}

/**
 * Read only the non-secret field mapping from store_integrations.settings.
 * The underlying settings JSON is never returned to the browser.
 */
export const getIntegrationFieldMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    store_id: z.string().uuid(),
    integration_key: z.string().min(2).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireIntegrationManager(data.store_id, context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("store_integrations")
      .select("settings")
      .eq("store_id", data.store_id)
      .eq("integration_key", data.integration_key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const mapping = row?.settings?.field_mapping;
    return mapping && typeof mapping === "object" ? mapping : {};
  });

/**
 * Update only the approved non-secret field_mapping key inside settings.
 * This is deliberately server-side so authenticated clients never receive
 * or write the raw settings JSON, which may contain future credentials.
 */
export const saveIntegrationFieldMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    store_id: z.string().uuid(),
    integration_key: z.string().min(2).max(64),
    mapping: fieldMappingSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireIntegrationManager(data.store_id, context.supabase, context.userId);
    const { data: row, error: readError } = await supabaseAdmin
      .from("store_integrations")
      .select("settings")
      .eq("store_id", data.store_id)
      .eq("integration_key", data.integration_key)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Integration is not configured for this store");

    const nextSettings = {
      ...(row.settings && typeof row.settings === "object" ? row.settings : {}),
      field_mapping: data.mapping,
    };
    const { error: updateError } = await supabaseAdmin
      .from("store_integrations")
      .update({ settings: nextSettings })
      .eq("store_id", data.store_id)
      .eq("integration_key", data.integration_key);
    if (updateError) throw new Error(updateError.message);
    return data.mapping;
  });
