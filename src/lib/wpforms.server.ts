// Shared WPForms payload → Comart+ order pipeline.
// Used by both the legacy HMAC endpoint (wp-forms-webhook.ts) and the new
// x-api-key endpoint (integrations.wpforms.webhook.ts). Do NOT import from
// client code — this file references the admin Supabase client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WpFormsFieldMapping = Partial<Record<
  "customer_name" | "phone" | "address" | "product" | "quantity" | "amount" | "notes",
  string | string[]
>>;

const DEFAULTS: Required<WpFormsFieldMapping> = {
  customer_name: ["name", "customer_name", "full_name", "first_name"],
  phone:         ["phone", "customer_phone", "mobile", "whatsapp"],
  address:       ["address", "delivery_address", "full_address"],
  product:       ["product", "product_name", "item"],
  quantity:      ["quantity", "qty"],
  amount:        ["amount", "total", "price"],
  notes:         ["notes", "message", "comment"],
};

function pick(flat: Record<string, any>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = flat?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function flattenWpFormsPayload(payload: any): Record<string, any> {
  const flat: Record<string, any> = {};
  if (payload?.fields && typeof payload.fields === "object") {
    for (const f of Object.values<any>(payload.fields)) {
      if (f?.name) flat[String(f.name).toLowerCase().replace(/\s+/g, "_")] = f.value;
    }
  }
  return { ...payload, ...flat };
}

async function pickRoundRobinAssignee(storeId: string): Promise<string | null> {
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles").select("user_id, is_suspended").eq("store_id", storeId);
  const targets = Array.from(new Map((roleRows || [])
    .filter((r: any) => !r.is_suspended)
    .map((r: any) => [r.user_id, r.user_id])).values()) as string[];
  if (!targets.length) return null;
  let best: string | null = null; let bestCount = Infinity;
  for (const uid of targets) {
    const { count } = await supabaseAdmin.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId).eq("assigned_to", uid).eq("is_archived", false)
      .in("status", ["pending", "processing", "shipped"]);
    const c = count ?? 0;
    if (c < bestCount) { bestCount = c; best = uid; }
  }
  return best;
}

export interface ProcessWpFormsResult {
  ok: boolean;
  order_id?: string;
  assigned_to?: string | null;
  error?: string;
}

/**
 * Convert a WPForms payload into a Comart+ order (customer + order + order_items),
 * apply tenant field mapping if provided, run round-robin auto-assign, and bump
 * the store_integrations counters.
 */
export async function processWpFormsOrder(
  storeId: string,
  payload: any,
  mapping?: WpFormsFieldMapping,
): Promise<ProcessWpFormsResult> {
  try {
    const flat = flattenWpFormsPayload(payload);

    const resolve = (k: keyof typeof DEFAULTS): string | undefined => {
      const custom = mapping?.[k];
      const customKeys = custom ? (Array.isArray(custom) ? custom : [custom]) : [];
      const keys = [...customKeys.map(s => s.toLowerCase().replace(/\s+/g, "_")), ...DEFAULTS[k]];
      return pick(flat, keys);
    };

    const name = resolve("customer_name") || "Web lead";
    const phone = resolve("phone") || "—";
    const address = resolve("address");
    const product = resolve("product");
    const qtyRaw = resolve("quantity");
    const amountRaw = resolve("amount");
    const notes = resolve("notes");

    // Upsert customer
    let customerId: string | null = null;
    if (phone && phone !== "—") {
      const { data: existing } = await supabaseAdmin.from("customers")
        .select("id").eq("store_id", storeId).eq("phone", phone).maybeSingle();
      if (existing) customerId = existing.id;
    }
    if (!customerId) {
      const { data: c, error: cErr } = await supabaseAdmin.from("customers").insert({
        store_id: storeId, name, phone, full_address: address || null,
      }).select("id").single();
      if (cErr) throw cErr;
      customerId = c.id;
    }

    // Parse quantity which may be a plain number OR a descriptive string like
    // "2 BOTTLES OF HAPPY FAMILY MANPOWER SYRUP 25,000 (BESTSELLER)".
    // Extract leading int as units, and price-before-parens as amount.
    let qty = 1;
    let parsedAmountFromQty: number | null = null;
    try {
      if (qtyRaw != null && String(qtyRaw).trim() !== "") {
        const raw = String(qtyRaw).trim();
        if (/^\d+(\.\d+)?$/.test(raw)) {
          qty = Math.max(1, Math.floor(Number(raw)));
        } else {
          const leading = raw.match(/^\s*(\d+)/);
          if (leading) {
            qty = Math.max(1, parseInt(leading[1], 10));
          } else {
            console.warn("[wpforms] Could not parse leading qty, defaulting to 1. Raw:", raw);
            qty = 1;
          }
          // Price = last number before "(" — strip commas
          const beforeParen = raw.split("(")[0];
          const numMatches = beforeParen.match(/[\d,]+(?:\.\d+)?/g) || [];
          const priceCandidates = numMatches.slice(1)
            .map(s => Number(s.replace(/,/g, "")))
            .filter(n => !isNaN(n) && n > 0);
          if (priceCandidates.length > 0) {
            parsedAmountFromQty = priceCandidates[priceCandidates.length - 1];
          }
        }
      }
    } catch (e) {
      console.warn("[wpforms] qty parse error, defaulting to 1:", e);
      qty = 1;
    }
    const amount = Number(amountRaw || 0) || parsedAmountFromQty || 0;
    const assignTo = await pickRoundRobinAssignee(storeId);

    const { data: order, error: oErr } = await supabaseAdmin.from("orders").insert({
      store_id: storeId, customer_id: customerId, customer_name: name,
      amount, units: qty, notes: notes || null, status: "pending",
      assigned_to: assignTo, assigned_at: assignTo ? new Date().toISOString() : null,
    }).select("id").single();
    if (oErr) throw oErr;

    if (product) {
      await supabaseAdmin.from("order_items").insert({
        store_id: storeId, order_id: order.id,
        product_name: product, quantity: qty,
        unit_price: amount / qty, subtotal: amount,
      });
    }

    // Bump integration counters (best-effort)
    await supabaseAdmin.rpc as any; // noop to keep TS happy if rpc unused
    await supabaseAdmin.from("store_integrations").update({
      last_webhook_at: new Date().toISOString(),
    }).eq("store_id", storeId).eq("integration_key", "wp_forms");
    // Increment counter via a raw SQL fallback (no rpc defined for inc)
    await supabaseAdmin.from("store_integrations")
      .select("id, orders_imported_count")
      .eq("store_id", storeId).eq("integration_key", "wp_forms")
      .maybeSingle()
      .then(async ({ data }) => {
        if (data?.id) {
          await supabaseAdmin.from("store_integrations")
            .update({ orders_imported_count: (data.orders_imported_count || 0) + 1 })
            .eq("id", data.id);
        }
      });

    return { ok: true, order_id: order.id, assigned_to: assignTo };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
