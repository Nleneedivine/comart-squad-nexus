import { createFileRoute } from "@tanstack/react-router";
import { BodyTooLargeError, readBodyLimited, safeJsonParse, verifyMetaSignature } from "@/lib/webhook-security";

/**
 * Meta WhatsApp Cloud API webhook.
 * - GET: subscription verification (hub.challenge), matched on a store's verify token.
 * - POST: incoming messages + status callbacks. Every POST must carry a valid
 *   X-Hub-Signature-256 computed with the Meta App Secret over the raw body.
 *   Fails closed (503) when WHATSAPP_APP_SECRET is not configured.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || token.length > 256) return new Response("bad request", { status: 400 });
        if (!challenge || !/^[\w.-]{1,128}$/.test(challenge)) return new Response("bad request", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("whatsapp_integrations")
          .select("id").eq("webhook_verify_token", token).limit(1);
        if (error) return new Response("error", { status: 500 });
        if (!data || data.length === 0) return new Response("forbidden", { status: 403 });
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request }) => {
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (!appSecret) {
          console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET not configured; rejecting delivery");
          return new Response("not configured", { status: 503 });
        }
        let raw: string;
        try {
          raw = await readBodyLimited(request, 1024 * 1024);
        } catch (e) {
          return new Response("bad request", { status: e instanceof BodyTooLargeError ? 413 : 400 });
        }
        if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const parsed = safeJsonParse(raw);
        if (!parsed.ok) return new Response("invalid json", { status: 400 });
        const body = parsed.value;
        if (!Array.isArray(body?.entry)) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const entry of body.entry) {
          for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
            const v = change?.value || {};
            const phoneNumberId = v.metadata?.phone_number_id;
            if (typeof phoneNumberId !== "string") continue;
            const { data: cfg, error: cfgErr } = await supabaseAdmin.from("whatsapp_integrations")
              .select("store_id, display_phone_number")
              .eq("phone_number_id", phoneNumberId).maybeSingle();
            if (cfgErr) return new Response("error", { status: 500 });
            if (!cfg) continue;
            const storeId = cfg.store_id;

            for (const m of Array.isArray(v.messages) ? v.messages : []) {
              if (typeof m?.id !== "string") continue;
              const { data: dup, error: dupErr } = await supabaseAdmin.from("whatsapp_message_logs")
                .select("id").eq("store_id", storeId).eq("wa_message_id", m.id).eq("direction", "inbound").limit(1);
              if (dupErr) return new Response("error", { status: 500 });
              if (dup && dup.length) continue;
              const { error } = await supabaseAdmin.from("whatsapp_message_logs").insert({
                store_id: storeId, direction: "inbound",
                to_phone: cfg.display_phone_number, from_phone: String(m.from ?? "").slice(0, 32),
                message_body: typeof m.text?.body === "string" ? m.text.body.slice(0, 4096) : null,
                wa_message_id: m.id, status: "received", payload: m,
              });
              if (error) return new Response("error", { status: 500 });
            }
            for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
              if (typeof s?.id !== "string") continue;
              const { error } = await supabaseAdmin.from("whatsapp_message_logs")
                .update({ status: String(s.status).slice(0, 32), error: s.errors?.[0]?.title || null, payload: s })
                .eq("store_id", storeId).eq("wa_message_id", s.id);
              if (error) return new Response("error", { status: 500 });
              if (s.status === "failed") {
                const { error: e2 } = await supabaseAdmin.from("whatsapp_integrations").update({
                  status: "needs_attention", last_error: s.errors?.[0]?.title || "Send failed",
                }).eq("store_id", storeId);
                if (e2) return new Response("error", { status: 500 });
              }
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
