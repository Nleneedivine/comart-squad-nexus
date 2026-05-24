import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { captureServerException } from "@/lib/sentry.server";

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

type ParsedOrder = {
  customer_name: string;
  phone: string;
  address?: string;
  items: { product_name: string; quantity: number; unit_price?: number; variant?: string }[];
  amount?: number;
  notes?: string;
  delivery?: string;
};

function sanitizeOrders(input: unknown): ParsedOrder[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      const record = row && typeof row === "object" ? row as Record<string, unknown> : null;
      if (!record) return null;
      const items = Array.isArray(record.items)
        ? record.items.reduce<ParsedOrder["items"]>((acc, item) => {
            const itemRecord = item && typeof item === "object" ? item as Record<string, unknown> : null;
            const productName = typeof itemRecord?.product_name === "string" ? itemRecord.product_name.trim() : "";
            if (!productName) return acc;
            const quantity = Number(itemRecord?.quantity ?? 1);
            const unitPrice = itemRecord?.unit_price == null ? undefined : Number(itemRecord.unit_price);
            const variant = typeof itemRecord?.variant === "string" && itemRecord.variant.trim() ? itemRecord.variant.trim() : undefined;
            acc.push({
              product_name: productName,
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
              unit_price: Number.isFinite(unitPrice) ? unitPrice : undefined,
              variant,
            });
            return acc;
          }, [])
        : [];

      if (items.length === 0) return null;

      const customerName = typeof record.customer_name === "string" ? record.customer_name.trim() : "";
      const phone = typeof record.phone === "string" ? record.phone.replace(/\D+/g, "") : "";
      const address = typeof record.address === "string" && record.address.trim() ? record.address.trim() : undefined;
      const notes = typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined;
      const delivery = typeof record.delivery === "string" && record.delivery.trim() ? record.delivery.trim() : undefined;
      const amount = record.amount == null ? undefined : Number(record.amount);

      return {
        customer_name: customerName || "Walk-in customer",
        phone,
        address,
        items,
        amount: Number.isFinite(amount) ? amount : undefined,
        notes,
        delivery,
      } satisfies ParsedOrder;
    })
    .filter(Boolean) as ParsedOrder[];
}

export const parseOrdersAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    if (!d || typeof d.text !== "string" || !d.text.trim()) throw new Error("text required");
    if (d.text.length > 200000) throw new Error("text too long (max 200k chars)");
    const products = Array.isArray(d.products) ? d.products.slice(0, 500).map(String) : [];
    return { text: d.text as string, products };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    try {
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
      return { orders: sanitizeOrders(parsed.orders) };
    } catch (error) {
      await captureServerException(error, {
        tags: { route: "parse_orders_ai", module: "bulk_import", kind: "server_function", severity: "high" },
        extra: { textLength: data.text.length, productCount: data.products.length },
        user: { id: context.userId },
      });
      throw error;
    }
  });
