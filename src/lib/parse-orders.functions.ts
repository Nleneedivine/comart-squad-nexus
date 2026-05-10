import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `You parse free-form Nigerian sales/order text into structured rows.
Return STRICT JSON with this shape: { "orders": [ { "customer_name": string, "phone": string, "address"?: string, "items": [ { "product_name": string, "quantity": number, "unit_price"?: number } ], "amount"?: number, "notes"?: string } ] }
Rules: phone is digits-only with country code if present. Quantity defaults to 1. amount is the total in NGN if explicitly mentioned, otherwise omit. Skip rows that are clearly headers/separators. Always return valid JSON, no commentary.`;

export const parseOrdersAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    if (!d || typeof d.text !== "string" || !d.text.trim()) throw new Error("text required");
    if (d.text.length > 50000) throw new Error("text too long");
    return { text: d.text as string };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds to continue.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
    const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    return { orders };
  });
