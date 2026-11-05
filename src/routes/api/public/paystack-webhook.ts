import { createFileRoute } from "@tanstack/react-router";
import { captureServerException } from "@/lib/sentry.server";
import {
  BodyTooLargeError,
  checkPaystackCharge,
  readBodyLimited,
  safeJsonParse,
  verifyPaystackSignature,
} from "@/lib/webhook-security";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-paystack-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

/** Thrown when settlement must be retried by Paystack (non-2xx response). */
class RetryableError extends Error {}

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const start = Date.now();
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Not configured", { status: 503, headers: corsHeaders });

        let body: string;
        try {
          body = await readBodyLimited(request, 128 * 1024);
        } catch (e) {
          return new Response(e instanceof BodyTooLargeError ? "Payload too large" : "Bad request", { status: e instanceof BodyTooLargeError ? 413 : 400, headers: corsHeaders });
        }
        if (!verifyPaystackSignature(body, request.headers.get("x-paystack-signature"), secret)) {
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }
        const parsed = safeJsonParse(body);
        if (!parsed.ok) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

        const event = parsed.value;
        const topic = typeof event?.event === "string" ? event.event : "unknown";
        const data = event?.data ?? {};
        const reference: string | null = typeof data?.reference === "string" && data.reference.length <= 120 ? data.reference : null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let storeId: string | null = null;
        let outcome = "ignored";

        const log = async (status: string, summary: string) => {
          if (!storeId) return;
          const { error } = await supabaseAdmin.from("webhook_logs").insert({
            store_id: storeId, topic, status, summary,
            // Minimal payload: no customer PII (email/phone/card) persisted.
            payload: { event: topic, reference, amount: data?.amount ?? null, currency: data?.currency ?? null, status: data?.status ?? null },
            duration_ms: Date.now() - start,
          });
          if (error) console.error("[paystack-webhook] log insert failed:", error.message);
        };

        try {
          if (topic === "charge.success" && reference && /^fund_/.test(reference)) {
            const { data: tx, error: txErr } = await supabaseAdmin.from("wallet_transactions")
              .select("id, store_id, amount, status, kind").eq("reference", reference).maybeSingle();
            if (txErr) throw new RetryableError(txErr.message);
            if (!tx || tx.kind !== "funding") {
              outcome = "unknown_reference";
            } else {
              storeId = tx.store_id;
              const metaStore = data?.metadata?.store_id;
              if (metaStore && metaStore !== tx.store_id) {
                outcome = "store_mismatch";
              } else if (tx.status !== "pending") {
                outcome = `already_${tx.status}`;
              } else {
                const check = checkPaystackCharge(data, { amount: Number(tx.amount) });
                const { data: res, error } = await supabaseAdmin.rpc("wallet_settle_transaction", {
                  _reference: reference,
                  _success: check.ok,
                  _paid_amount: check.ok ? check.paid : undefined,
                });
                if (error) throw new RetryableError(`settlement failed: ${error.message}`);
                const r = res as { ok?: boolean; already?: boolean; error?: string } | null;
                if (!r) throw new RetryableError("settlement returned no result");
                outcome = check.ok ? (r.ok ? "credited" : `rejected_${r.error || "unknown"}`) : `rejected_${check.reason}`;
              }
            }
          } else if (topic === "charge.success" && data?.metadata?.kind === "integration_purchase" && reference) {
            const meta = data.metadata;
            const { data: row, error: rowErr } = await supabaseAdmin.from("store_integrations")
              .select("id, store_id, integration_key, paystack_reference, status")
              .eq("paystack_reference", reference).maybeSingle();
            if (rowErr) throw new RetryableError(rowErr.message);
            if (!row || row.store_id !== meta.store_id || row.integration_key !== meta.integration_key) {
              outcome = "unknown_reference";
            } else {
              storeId = row.store_id;
              if (row.status === "active") {
                outcome = "already_active";
              } else {
                const { data: cat, error: catErr } = await supabaseAdmin.from("integration_catalog")
                  .select("monthly_price").eq("key", row.integration_key).maybeSingle();
                if (catErr) throw new RetryableError(catErr.message);
                const check = checkPaystackCharge(data, { amount: Number(cat?.monthly_price ?? NaN) });
                if (!check.ok) {
                  outcome = `rejected_${check.reason}`;
                } else {
                  const { error: upErr } = await supabaseAdmin.from("store_integrations").update({
                    status: "active",
                    activated_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 31 * 86400000).toISOString(),
                  }).eq("id", row.id).eq("paystack_reference", reference);
                  if (upErr) throw new RetryableError(upErr.message);
                  outcome = "activated";
                  const { error: nErr } = await supabaseAdmin.from("notifications").insert({
                    store_id: row.store_id, user_id: null,
                    title: "Integration activated", body: `${row.integration_key} is now active.`, kind: "success",
                  });
                  if (nErr) console.error("[paystack-webhook] notification failed:", nErr.message);
                }
              }
            }
          } else if ((topic === "transfer.success" || topic === "transfer.failed" || topic === "transfer.reversed") && reference) {
            const { data: res, error } = await supabaseAdmin.rpc("wallet_settle_transaction", {
              _reference: reference, _success: topic === "transfer.success",
            });
            if (error) throw new RetryableError(`settlement failed: ${error.message}`);
            const r = res as { store_id?: string; error?: string } | null;
            storeId = r?.store_id ?? null;
            outcome = r?.error ? `rejected_${r.error}` : "settled";
          }
          await log(outcome.startsWith("rejected") || outcome.endsWith("mismatch") ? "failed" : "successful", `${topic} ref=${reference || "n/a"}: ${outcome}`);
          return json({ ok: true, outcome });
        } catch (e: any) {
          await log("failed", `${topic} ref=${reference || "n/a"}: ${e?.message || "error"}`);
          await captureServerException(e, {
            tags: { route: "paystack-webhook", topic, kind: "webhook" },
            extra: { storeId, reference, event_type: topic },
            request: { url: request.url, method: request.method },
            fingerprint: ["paystack-webhook", topic],
          });
          // Non-2xx so Paystack retries; settlement is idempotent on reference.
          return json({ ok: false, error: "processing_failed" }, 500);
        }
      },
    },
  },
});
