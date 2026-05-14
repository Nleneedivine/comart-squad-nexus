import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureServerException } from "@/lib/sentry.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-paystack-signature, x-comart-signature",
};

const READABLE: Record<string, string> = {
  "subscription.create": "Subscription created",
  "subscription.disable": "Subscription cancelled",
  "subscription.not_renew": "Subscription will not renew",
  "invoice.create": "Invoice issued",
  "invoice.update": "Invoice updated",
  "invoice.payment_failed": "Payment failed",
  "charge.success": "Payment received",
  "charge.failed": "Payment failed",
};

async function logActivity(storeId: string | null, topic: string, status: string, summary: string, payload: any, durationMs: number) {
  if (!storeId) return;
  await supabaseAdmin.from("webhook_logs").insert({
    store_id: storeId, topic, status, summary, payload, duration_ms: durationMs,
  });
  await supabaseAdmin.from("activity_log").insert({
    store_id: storeId, type: "billing",
    activity: `${READABLE[topic] || topic}: ${summary}`,
    metadata: { topic, status, payload_ref: payload?.data?.reference ?? null },
  });
}

export const Route = createFileRoute("/api/public/billing-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const start = Date.now();
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Not configured", { status: 500, headers: corsHeaders });

        const signature = request.headers.get("x-paystack-signature") || "";
        const body = await request.text();
        const expected = createHmac("sha512", secret).update(body).digest("hex");

        try {
          const a = Buffer.from(signature, "hex");
          const b = Buffer.from(expected, "hex");
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("Invalid signature", { status: 401, headers: corsHeaders });
          }
        } catch {
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }

        const event = JSON.parse(body);
        const topic = event?.event || "unknown";
        const data = event?.data || {};
        const storeId = data?.metadata?.store_id || null;

        try {
          if (topic === "charge.success" && storeId) {
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            await supabaseAdmin.from("subscriptions").update({
              status: "active", trial_ends_at: null,
              current_period_end: periodEnd.toISOString(),
              next_billing_at: periodEnd.toISOString(),
            }).eq("store_id", storeId);
          } else if (topic === "invoice.payment_failed" && storeId) {
            await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("store_id", storeId);
          } else if ((topic === "subscription.disable" || topic === "subscription.not_renew") && storeId) {
            await supabaseAdmin.from("subscriptions").update({ status: "cancelled" }).eq("store_id", storeId);
          }

          const summary = data?.reference ? `ref ${data.reference}` : data?.customer?.email || "event received";
          await logActivity(storeId, topic, "successful", summary, event, Date.now() - start);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e: any) {
          await logActivity(storeId, topic, "failed", e?.message || "Error", event, Date.now() - start);
          await captureServerException(e, {
            tags: { route: "billing-webhook", topic, kind: "webhook" },
            extra: { storeId, event_type: topic, reference: data?.reference ?? null },
            user: storeId ? { id: storeId } : undefined,
            request: { url: request.url, method: request.method },
            fingerprint: ["billing-webhook", topic],
          });
          return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      },
    },
  },
});
