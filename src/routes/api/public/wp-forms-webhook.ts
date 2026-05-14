import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureServerException } from "@/lib/sentry.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-comart-signature, x-comart-store",
};

function pickField(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    if (obj?.[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  return undefined;
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
      .in("status", ["pending","processing","shipped"]);
    const c = count ?? 0;
    if (c < bestCount) { bestCount = c; best = uid; }
  }
  return best;
}

export const Route = createFileRoute("/api/public/wp-forms-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const storeId = request.headers.get("x-comart-store") || new URL(request.url).searchParams.get("store");
        if (!storeId) return new Response("Missing store id", { status: 400, headers: corsHeaders });

        const { data: store } = await supabaseAdmin.from("stores")
          .select("id, webhook_secret").eq("id", storeId).maybeSingle();
        if (!store?.webhook_secret) return new Response("Unknown store", { status: 404, headers: corsHeaders });

        const signature = request.headers.get("x-comart-signature") || "";
        const body = await request.text();
        const expected = createHmac("sha256", store.webhook_secret).update(body).digest("hex");
        try {
          const a = Buffer.from(signature, "hex");
          const b = Buffer.from(expected, "hex");
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            await supabaseAdmin.from("webhook_deliveries").insert({
              store_id: storeId, source: "wp-forms", status: "rejected",
              payload: {}, error: "Invalid signature",
            });
            return new Response("Invalid signature", { status: 401, headers: corsHeaders });
          }
        } catch {
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }

        let payload: any = {};
        try { payload = JSON.parse(body); } catch {
          return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
        }

        // WP Forms shape: { fields: { id: { name, value }, ... }, ... } OR flat object
        const flat: Record<string, any> = {};
        if (payload?.fields && typeof payload.fields === "object") {
          for (const f of Object.values<any>(payload.fields)) {
            if (f?.name) flat[String(f.name).toLowerCase().replace(/\s+/g, "_")] = f.value;
          }
        }
        const merged = { ...payload, ...flat };

        const name = pickField(merged, ["name","customer_name","full_name","first_name"]) || "Web lead";
        const phone = pickField(merged, ["phone","customer_phone","mobile","whatsapp"]) || "—";
        const address = pickField(merged, ["address","delivery_address","full_address"]);
        const product = pickField(merged, ["product","product_name","item"]);
        const qtyRaw = pickField(merged, ["quantity","qty"]);
        const amountRaw = pickField(merged, ["amount","total","price"]);
        const notes = pickField(merged, ["notes","message","comment"]);

        try {
          // upsert customer
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

          const qty = Number(qtyRaw || 1);
          const amount = Number(amountRaw || 0);
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
              product_name: product, quantity: qty, unit_price: amount / Math.max(qty,1),
              subtotal: amount,
            });
          }

          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: storeId, source: "wp-forms", status: "processed",
            payload, result: { order_id: order.id, assigned_to: assignTo },
          });
          return new Response(JSON.stringify({ ok: true, order_id: order.id }), {
            status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (e: any) {
          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: storeId, source: "wp-forms", status: "failed",
            payload, error: e?.message || String(e),
          });
          await captureServerException(e, {
            tags: { route: "wp-forms-webhook", kind: "webhook", source: "wp-forms" },
            extra: { storeId, payload_keys: Object.keys(payload || {}) },
            user: { id: storeId },
            request: { url: request.url, method: request.method },
            fingerprint: ["wp-forms-webhook"],
          });
          return new Response(JSON.stringify({ ok: false, error: e?.message }), {
            status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      },
    },
  },
});
