import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta WhatsApp Cloud API webhook.
 * - GET: subscription verification (hub.challenge).
 * - POST: incoming messages + status callbacks; matched to store via phone_number_id.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token) return new Response("bad request", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("whatsapp_integrations" as any)
          .select("id").eq("webhook_verify_token", token).limit(1);
        if (!data || data.length === 0) return new Response("forbidden", { status: 403 });
        return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null) as any;
        if (!body?.entry) return new Response("ok");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const entry of body.entry) {
          for (const change of entry.changes || []) {
            const v = change.value || {};
            const phoneNumberId = v.metadata?.phone_number_id;
            if (!phoneNumberId) continue;
            const { data: cfg } = await supabaseAdmin.from("whatsapp_integrations" as any)
              .select("store_id, display_phone_number")
              .eq("phone_number_id", phoneNumberId).maybeSingle();
            if (!cfg) continue;
            const storeId = (cfg as any).store_id;

            // Inbound messages
            for (const m of v.messages || []) {
              await supabaseAdmin.from("whatsapp_message_logs" as any).insert({
                store_id: storeId, direction: "inbound",
                to_phone: (cfg as any).display_phone_number, from_phone: m.from,
                message_body: m.text?.body ?? null, wa_message_id: m.id,
                status: "received", payload: m,
              });
            }
            // Delivery statuses
            for (const s of v.statuses || []) {
              await supabaseAdmin.from("whatsapp_message_logs" as any)
                .update({ status: s.status, error: s.errors?.[0]?.title || null, payload: s })
                .eq("wa_message_id", s.id);
              if (s.status === "failed") {
                await supabaseAdmin.from("whatsapp_integrations" as any).update({
                  status: "needs_attention", last_error: s.errors?.[0]?.title || "Send failed",
                }).eq("store_id", storeId);
              }
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
