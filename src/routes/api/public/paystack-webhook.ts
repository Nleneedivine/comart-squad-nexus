import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureServerException } from "@/lib/sentry.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-paystack-signature",
};

async function logWebhook(storeId: string | null, topic: string, status: string, summary: string, payload: any, durationMs: number) {
  if (!storeId) return;
  await supabaseAdmin.from("webhook_logs").insert({
    store_id: storeId, topic, status, summary, payload, duration_ms: durationMs,
  });
}

export const Route = createFileRoute("/api/public/paystack-webhook")({
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
        const reference = event?.data?.reference;
        const storeId = event?.data?.metadata?.store_id || null;

        try {
          if (topic === "charge.success" && reference && /^fund_/.test(reference)) {
            await supabaseAdmin.rpc("wallet_settle_transaction", { _reference: reference, _success: true, _paid_amount: Number(event?.data?.amount || 0) / 100 });
          } else if (topic === "charge.success" && event?.data?.metadata?.kind === "integration_purchase" && reference) {
            const meta = event.data.metadata;
            if (!meta?.store_id || !meta?.integration_key) {
              throw new Error("Integration purchase webhook is missing store metadata");
            }

            // Bind the webhook to the exact pending transaction we created.
            // Do not let an authenticated Paystack event activate an arbitrary
            // store/integration pair merely because metadata contains IDs.
            const { data: pending, error: pendingError } = await supabaseAdmin
              .from("store_integrations")
              .select("store_id, integration_key, status, paystack_reference")
              .eq("paystack_reference", reference)
              .maybeSingle();
            if (pendingError) throw pendingError;
            if (
              !pending ||
              pending.status !== "pending" ||
              pending.store_id !== meta.store_id ||
              pending.integration_key !== meta.integration_key
            ) {
              throw new Error("Integration purchase reference is not a matching pending transaction");
            }

            const { error: activateError } = await supabaseAdmin.from("store_integrations").update({
              status: "active",
              activated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 31 * 86400000).toISOString(),
            }).eq("store_id", pending.store_id).eq("integration_key", pending.integration_key)
              .eq("paystack_reference", reference).eq("status", "pending");
            if (activateError) throw activateError;

            await supabaseAdmin.from("notifications").insert({
              store_id: pending.store_id, user_id: meta.user_id || null,
              title: "Integration activated", body: `${pending.integration_key} is now active.`, kind: "success",
            }).then(() => null, () => null);
          } else if ((topic === "transfer.success" || topic === "transfer.failed" || topic === "transfer.reversed") && reference) {
            await supabaseAdmin.rpc("wallet_settle_transaction", { _reference: reference, _success: topic === "transfer.success" });
          }
          await logWebhook(storeId, topic, "successful", `Processed ${topic} ref=${reference || "n/a"}`, event, Date.now() - start);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (e: any) {
          await logWebhook(storeId, topic, "failed", e?.message || "Error processing", event, Date.now() - start);
          await captureServerException(e, {
            tags: { route: "paystack-webhook", topic, kind: "webhook" },
            extra: { storeId, reference, event_type: topic },
            user: storeId ? { id: storeId } : undefined,
            request: { url: request.url, method: request.method },
            fingerprint: ["paystack-webhook", topic],
          });
          return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      },
    },
  },
});
