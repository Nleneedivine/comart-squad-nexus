// POST /api/public/integrations/wpforms/webhook
// Auth: x-api-key header. Looked up by SHA-256 hash (api_key_hash, once the
// stage-3 migration is applied) with a fallback to the legacy plaintext column.
// Unauthenticated rejections are not persisted with payload (no PII stored for
// anonymous callers).
import { createFileRoute } from "@tanstack/react-router";
import { processWpFormsOrder, type WpFormsFieldMapping } from "@/lib/wpforms.server";
import { captureServerException } from "@/lib/sentry.server";
import {
  BodyTooLargeError,
  deliveryDedupeKey,
  readBodyLimited,
  safeJsonParse,
  sha256Hex,
} from "@/lib/webhook-security";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/integrations/wpforms/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const apiKey = (request.headers.get("x-api-key") || "").trim();
        if (!apiKey || apiKey.length > 128 || !/^[\w-]+$/.test(apiKey)) {
          return json({ ok: false, error: "Invalid API key" }, 401);
        }
        let body: string;
        try {
          body = await readBodyLimited(request, 64 * 1024);
        } catch (e) {
          return json({ ok: false, error: e instanceof BodyTooLargeError ? "Payload too large" : "Bad request" }, e instanceof BodyTooLargeError ? 413 : 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const keyHash = sha256Hex(apiKey);
        let integ: { store_id: string; status: string; settings: any } | null = null;
        const byHash = await (supabaseAdmin.from("store_integrations") as any)
          .select("store_id, status, settings")
          .eq("api_key_hash", keyHash).eq("integration_key", "wp_forms").maybeSingle();
        if (!byHash.error) integ = byHash.data;
        if (!integ) {
          const legacy = await supabaseAdmin.from("store_integrations")
            .select("store_id, status, settings")
            .eq("api_key", apiKey).eq("integration_key", "wp_forms").maybeSingle();
          if (legacy.error) return json({ ok: false, error: "Temporary error" }, 500);
          integ = legacy.data;
        }
        if (!integ) return json({ ok: false, error: "Invalid API key" }, 401);
        if (integ.status !== "active") {
          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: integ.store_id, source: "wp-forms", integration_key: "wp_forms", status: "rejected",
            payload: {}, error: `Integration not active (status: ${integ.status})`,
          });
          return json({ ok: false, error: "Integration not active" }, 403);
        }

        const parsed = safeJsonParse(body);
        if (!parsed.ok) {
          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: integ.store_id, source: "wp-forms", integration_key: "wp_forms", status: "rejected",
            payload: {}, error: "Invalid JSON body",
          });
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }
        const payload = parsed.value;
        const dedupeKey = deliveryDedupeKey(payload, body);

        try {
          const mapping = (integ.settings as any)?.field_mapping as WpFormsFieldMapping | undefined;
          const result = await processWpFormsOrder(integ.store_id, payload, mapping, { dedupeKey });
          if (!result.duplicate) {
            const { error: logErr } = await supabaseAdmin.from("webhook_deliveries").insert({
              store_id: integ.store_id, source: "wp-forms", integration_key: "wp_forms",
              status: result.ok ? "processed" : "failed",
              payload, response: result as any,
              result: result.ok ? { order_id: result.order_id, assigned_to: result.assigned_to, dedupe_key: dedupeKey } : { dedupe_key: dedupeKey },
              error: result.ok ? null : result.error,
            });
            if (logErr) console.error("[wpforms] delivery log failed:", logErr.message);
          }
          return json(result.ok ? { ok: true, order_id: result.order_id, duplicate: !!result.duplicate } : { ok: false, error: "Order could not be created" }, result.ok ? 200 : 500);
        } catch (e: any) {
          await captureServerException(e, {
            tags: { route: "wpforms-api-key-webhook", kind: "webhook", source: "wp-forms" },
            extra: { storeId: integ.store_id },
            fingerprint: ["wpforms-api-key-webhook"],
          });
          return json({ ok: false, error: "Order could not be created" }, 500);
        }
      },
    },
  },
});
