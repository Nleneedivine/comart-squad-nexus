import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "check_low_stock",
  title: "Check low stock",
  description: "List products at or below their low-stock threshold for the signed-in user's store.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, stock_qty, low_stock_threshold")
      .order("stock_qty", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const low = (data ?? []).filter(
      (p: any) => typeof p.low_stock_threshold === "number" && (p.stock_qty ?? 0) <= p.low_stock_threshold,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(low, null, 2) }],
      structuredContent: { low_stock: low },
    };
  },
});
