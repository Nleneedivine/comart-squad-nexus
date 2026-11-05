// Legacy HMAC-signed WP Forms endpoint. Same order pipeline as the x-api-key
// endpoint (processWpFormsOrder) so validation, atomicity and dedupe match.
import { createFileRoute } from "@tanstack/react-router";
import { captureServerException } from "@/lib/sentry.server";
import { processWpFormsOrder } from "@/lib/wpforms.server";
import {
  BodyTooLargeError,
  deliveryDedupeKey,
  hmacHex,
  readBodyLimited,
  safeHexEqual,
  safeJsonParse,
} from "@/lib/webhook-security";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-comart-signature, x-comart-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/wp-forms-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const storeId = request.headers.get("x-comart-store") || new URL(request.url).searchParams.get("store");
        if (!storeId || !UUID.test(storeId)) return json({ ok: false, error: "Unauthorized" }, 401);

        let body: string;
        try {
          body = await readBodyLimited(request, 64 * 1024);
        } catch (e) {
          return json({ ok: false, error: e instanceof BodyTooLargeError ? "Payload too large" : "Bad request" }, e instanceof BodyTooLargeError ? 413 : 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: store, error: sErr } = await supabaseAdmin.from("stores")
          .select("id, webhook_secret, status").eq("id", storeId).maybeSingle();
        if (sErr) return json({ ok: false, error: "Temporary error" }, 500);
        const signature = request.headers.get("x-comart-signature") || "";
        // Same response for unknown store and bad signature: no store enumeration.
        if (!store?.webhook_secret || store.status !== "active" || !safeHexEqual(signature, hmacHex("sha256", store.webhook_secret, body))) {
          if (store?.id) {
            await supabaseAdmin.from("webhook_deliveries").insert({
              store_id: store.id, source: "wp-forms", status: "rejected", payload: {}, error: "Invalid signature",
            });
          }
          return json({ ok: false, error: "Unauthorized" }, 401);
        }

        const parsed = safeJsonParse(body);
        if (!parsed.ok) return json({ ok: false, error: "Invalid JSON" }, 400);
        const payload = parsed.value;
        const dedupeKey = deliveryDedupeKey(payload, body);

        try {
          const result = await processWpFormsOrder(storeId, payload, undefined, { dedupeKey });
          if (!result.duplicate) {
            const { error: logErr } = await supabaseAdmin.from("webhook_deliveries").insert({
              store_id: storeId, source: "wp-forms", status: result.ok ? "processed" : "failed",
              payload,
              result: result.ok ? { order_id: result.order_id, assigned_to: result.assigned_to, dedupe_key: dedupeKey } : { dedupe_key: dedupeKey },
              error: result.ok ? null : result.error,
            });
            if (logErr) console.error("[wp-forms-webhook] delivery log failed:", logErr.message);
          }
          return result.ok
            ? json({ ok: true, order_id: result.order_id, duplicate: !!result.duplicate })
            : json({ ok: false, error: "Order could not be created" }, 500);
        } catch (e: any) {
          await captureServerException(e, {
            tags: { route: "wp-forms-webhook", kind: "webhook", source: "wp-forms" },
            extra: { storeId, payload_keys: Object.keys(payload || {}) },
            request: { url: request.url, method: request.method },
            fingerprint: ["wp-forms-webhook"],
          });
          return json({ ok: false, error: "Order could not be created" }, 500);
        }
      },
    },
  },
});
