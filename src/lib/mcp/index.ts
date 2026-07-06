import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentOrders from "./tools/list-recent-orders";
import checkLowStock from "./tools/check-low-stock";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "comart-plus-mcp",
  title: "Comart+ MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Comart+ operations app. Use `list_recent_orders` to review the latest call orders and `check_low_stock` to see products at or below their low-stock threshold. All tools act as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRecentOrders, checkLowStock],
});
