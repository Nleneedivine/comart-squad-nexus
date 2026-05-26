// POST /api/public/integrations/wpforms/webhook
// Auth: x-api-key header — looked up in store_integrations(api_key) where
// integration_key='wp_forms' and status='active'.
// Logs every request (accepted, rejected, failed) into webhook_deliveries.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processWpFormsOrder, type WpFormsFieldMapping } from "@/lib/wpforms.server";
import { captureServerException } from "@/lib/sentry.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function json(body: any, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
  });
}

export const Route = createFileRoute("/api/public/integrations/wpforms/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key") || "";
        const body = await request.text();
        let payload: any = {};
        try { payload = body ? JSON.parse(body) : {}; } catch {
          const resp = { ok: false, error: "Invalid JSON body" };
          await supabaseAdmin.from("webhook_deliveries").insert({
            source: "wp-forms", integration_key: "wp_forms", status: "rejected",
            payload: { raw: body.slice(0, 2000) }, response: resp, error: resp.error,
          });
          return json(resp, 400);
        }

        if (!apiKey) {
          const resp = { ok: false, error: "Missing x-api-key header" };
          await supabaseAdmin.from("webhook_deliveries").insert({
            source: "wp-forms", integration_key: "wp_forms", status: "rejected",
            payload, response: resp, error: resp.error,
          });
          return json(resp, 401);
        }

        const { data: integ } = await supabaseAdmin
          .from("store_integrations")
          .select("store_id, status, settings")
          .eq("api_key", apiKey)
          .eq("integration_key", "wp_forms")
          .maybeSingle();

        if (!integ || integ.status !== "active") {
          const resp = { ok: false, error: integ ? `Integration not active (status: ${integ.status})` : "Invalid API key" };
          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: integ?.store_id ?? null,
            source: "wp-forms", integration_key: "wp_forms", status: "rejected",
            payload, response: resp, error: resp.error,
          });
          return json(resp, 401);
        }

        try {
          const mapping = (integ.settings as any)?.field_mapping as WpFormsFieldMapping | undefined;
          const result = await processWpFormsOrder(integ.store_id, payload, mapping);

          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: integ.store_id,
            source: "wp-forms",
            integration_key: "wp_forms",
            status: result.ok ? "processed" : "failed",
            payload,
            response: result,
            result: result.ok ? { order_id: result.order_id, assigned_to: result.assigned_to } : null,
            error: result.ok ? null : result.error,
          });

          return json(result, result.ok ? 200 : 500);
        } catch (e: any) {
          const resp = { ok: false, error: e?.message || String(e) };
          await supabaseAdmin.from("webhook_deliveries").insert({
            store_id: integ.store_id,
            source: "wp-forms", integration_key: "wp_forms", status: "failed",
            payload, response: resp, error: resp.error,
          });
          await captureServerException(e, {
            tags: { route: "wpforms-api-key-webhook", kind: "webhook", source: "wp-forms" },
            extra: { storeId: integ.store_id },
            fingerprint: ["wpforms-api-key-webhook"],
          });
          return json(resp, 500);
        }
      },
    },
  },
});
