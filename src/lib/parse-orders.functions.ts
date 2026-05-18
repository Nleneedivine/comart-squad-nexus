import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `You are an expert order parser for a Nigerian SME platform. You receive raw text — pasted WhatsApp/SMS orders, spreadsheet rows, WordPress form submissions, CSV-like data, or free-form notes — and return structured orders.

Return STRICT JSON with this shape:
{ "orders": [ { "customer_name": string, "phone": string, "address"?: string, "items": [ { "product_name": string, "quantity": number, "unit_price"?: number, "variant"?: string } ], "amount"?: number, "notes"?: string, "delivery"?: string } ] }

RULES:
1. Phone is digits-only (keep country code if present, e.g. 2348012345678 or 08012345678).
2. Quantity defaults to 1 if not stated.
3. amount = total order value in NGN if explicit; otherwise omit.
4. Skip header rows, separator lines, totals/footer rows.
5. Spreadsheet-aware: recognize columns regardless of naming — "Customer Name"/"Name"/"Client", "Phone"/"Mobile"/"Tel", "Product"/"Item"/"Order"/"Goods", "Qty"/"Quantity"/"Units", "Address"/"Delivery Address"/"Location", "Notes"/"Remark".
6. WordPress form export: recognize "Field: Value" pair lines, blank-line separated submissions.
7. If a product catalog is provided in context, FUZZY-MATCH every parsed product name to the closest catalog item (e.g. "red XL shirt" → "Red T-shirt XL"; "nike 42" → "Nike shoe size 42"). Use the catalog's exact product_name in the output. If no good match, keep the raw text.
8. Capture variant info (size, color) into either product_name (preferred when matched) or "variant" field.
9. ALWAYS return valid JSON, no markdown, no commentary.`;

export const parseOrdersAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    if (!d || typeof d.text !== "string" || !d.text.trim()) throw new Error("text required");
    if (d.text.length > 200000) throw new Error("text too long (max 200k chars)");
    const products = Array.isArray(d.products) ? d.products.slice(0, 500).map(String) : [];
    return { text: d.text as string, products };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const catalogBlock = data.products.length
      ? `\n\nTENANT PRODUCT CATALOG (use these exact names when matched):\n- ${data.products.join("\n- ")}`
      : "";
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM + catalogBlock },
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
