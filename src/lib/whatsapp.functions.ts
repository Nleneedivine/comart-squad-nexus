import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GRAPH = "https://graph.facebook.com/v21.0";

async function assertAdmin(ctx: any, storeId: string) {
  const { data: ok } = await ctx.supabase.rpc("is_store_admin", { _user_id: ctx.userId, _store_id: storeId });
  if (!ok) throw new Error("Forbidden");
}

/** Save / connect WhatsApp Business credentials */
export const saveWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    store_id: z.string().uuid(),
    phone_number_id: z.string().min(3),
    waba_id: z.string().min(3),
    access_token: z.string().min(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.store_id);

    // Test call to Meta
    let display_phone_number: string | null = null;
    let verified_name: string | null = null;
    let last_error: string | null = null;
    let status = "connected";
    try {
      const r = await fetch(`${GRAPH}/${data.phone_number_id}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Meta API error");
      display_phone_number = j.display_phone_number;
      verified_name = j.verified_name;
    } catch (e: any) {
      status = "needs_attention";
      last_error = e.message;
    }

    const verify_token = crypto.randomUUID().replace(/-/g, "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_integrations" as any).upsert({
      store_id: data.store_id,
      phone_number_id: data.phone_number_id,
      waba_id: data.waba_id,
      access_token_encrypted: data.access_token, // stored server-side only; never returned to client
      display_phone_number,
      verified_name,
      webhook_verify_token: verify_token,
      status,
      last_error,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
    if (error) throw new Error(error.message);
    return { status, display_phone_number, verified_name, last_error, verify_token };
  });

/** Test the currently-stored connection */
export const testWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ store_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.store_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("whatsapp_integrations" as any)
      .select("*").eq("store_id", data.store_id).maybeSingle();
    if (!row) throw new Error("Not connected");
    const r = await fetch(`${GRAPH}/${(row as any).phone_number_id}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${(row as any).access_token_encrypted}` },
    });
    const j: any = await r.json();
    if (!r.ok) {
      await supabaseAdmin.from("whatsapp_integrations" as any).update({
        status: "needs_attention", last_error: j?.error?.message, last_tested_at: new Date().toISOString(),
      }).eq("store_id", data.store_id);
      return { ok: false, error: j?.error?.message };
    }
    await supabaseAdmin.from("whatsapp_integrations" as any).update({
      status: "connected", last_error: null, last_tested_at: new Date().toISOString(),
      display_phone_number: j.display_phone_number, verified_name: j.verified_name,
    }).eq("store_id", data.store_id);
    return { ok: true, ...j };
  });

/** Send a message now (or drain queued outbound logs) */
export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    store_id: z.string().uuid(),
    to: z.string().min(6),
    body: z.string().min(1),
    use_case: z.string().optional(),
    template_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.store_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin.from("whatsapp_integrations" as any)
      .select("*").eq("store_id", data.store_id).maybeSingle();
    if (!cfg) throw new Error("Not connected");
    const c: any = cfg;
    const r = await fetch(`${GRAPH}/${c.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.access_token_encrypted}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: data.to.replace(/[^\d]/g, ""),
        type: "text",
        text: { body: data.body },
      }),
    });
    const j: any = await r.json();
    const wa_id = j?.messages?.[0]?.id ?? null;
    await supabaseAdmin.from("whatsapp_message_logs" as any).insert({
      store_id: data.store_id, direction: "outbound", use_case: data.use_case,
      template_id: data.template_id, to_phone: data.to, from_phone: c.display_phone_number,
      message_body: data.body, wa_message_id: wa_id,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : (j?.error?.message || "send failed"),
      payload: j,
    });
    if (!r.ok) throw new Error(j?.error?.message || "Send failed");
    return { ok: true, wa_message_id: wa_id };
  });

/** AI Assist via Lovable AI Gateway */
export const whatsappAiAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    action: z.enum(["generate", "tone", "shorten", "lengthen", "translate"]),
    prompt: z.string().optional(),
    current: z.string().optional(),
    tone: z.string().optional(),
    language: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const sys = "You write concise WhatsApp business messages (max 500 chars). Preserve any {{placeholders}} exactly. Return only the message body, no quotes or commentary.";
    let user = "";
    if (data.action === "generate") user = `Write a WhatsApp message: ${data.prompt}`;
    else if (data.action === "tone") user = `Rewrite the following message in a ${data.tone} tone, keep placeholders intact:\n\n${data.current}`;
    else if (data.action === "shorten") user = `Shorten this WhatsApp message, keep placeholders intact:\n\n${data.current}`;
    else if (data.action === "lengthen") user = `Expand this WhatsApp message with helpful detail, keep placeholders intact:\n\n${data.current}`;
    else if (data.action === "translate") user = `Translate this message to ${data.language}, keep placeholders intact:\n\n${data.current}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!r.ok) throw new Error(`AI error ${r.status}`);
    const j: any = await r.json();
    return { text: (j.choices?.[0]?.message?.content || "").trim() };
  });

/** Soft-delete an agent with reassignment check */
export const softDeleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    store_id: z.string().uuid(),
    reassign_to: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.store_id);
    const { supabase } = context;
    // Count active stock allocations
    const { data: stocks } = await supabase.from("agent_stocks")
      .select("id, quantity").eq("store_id", data.store_id).eq("agent_id", data.agent_id);
    const active = (stocks || []).filter((s: any) => (s.quantity || 0) > 0);
    if (active.length > 0 && !data.reassign_to) {
      return { needs_reassign: true, active_count: active.length };
    }
    if (data.reassign_to && active.length > 0) {
      await supabase.from("agent_stocks").update({ agent_id: data.reassign_to })
        .eq("store_id", data.store_id).eq("agent_id", data.agent_id);
    }
    const { error } = await supabase.from("agents").update({
      status: "deleted", deleted_at: new Date().toISOString(),
    } as any).eq("id", data.agent_id).eq("store_id", data.store_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
