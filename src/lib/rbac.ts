// Role-based access control map.
// Owner / admin see everything; other roles get a curated subset.

export type Role =
  | "owner" | "admin" | "manager" | "head_of_operations"
  | "sales_rep" | "hr" | "inventory_manager" | "marketer"
  | "order_manager" | "customer_care" | "logistics_manager" | "accountant";

// Routes each role may access (in addition to baseline routes).
const BASELINE = ["/Dashboard", "/Settings", "/attendance", "/chat", "/tasks", "/staff-portal"];

const ROLE_ROUTES: Record<string, string[]> = {
  owner: ["*"],
  admin: ["*"],
  manager: ["*"],
  head_of_operations: ["*"],
  sales_rep: ["/orders", "/customer-service", "/store/orders", "/store/products"],
  hr: ["/staff", "/payroll", "/attendance"],
  inventory_manager: [
    "/inventory/products", "/inventory/buy-stock", "/inventory/stock-record",
    "/inventory/faulty", "/inventory/agent-stock", "/inventory/waybill",
    "/businesses", "/store/products", "/suppliers", "/purchase-orders",
  ],
  marketer: ["/marketing/sales-forms", "/agents", "/customer-service"],
  order_manager: ["/orders", "/store/orders", "/customer-service", "/inventory/waybill"],
  customer_care: ["/customer-service", "/orders"],
  logistics_manager: ["/inventory/waybill", "/orders", "/inventory/agent-stock"],
  accountant: ["/finance", "/wallet", "/reports/export", "/reports/activity", "/suppliers", "/payroll"],
};

export function canAccess(roles: string[], path: string): boolean {
  if (!roles || roles.length === 0) return false;
  const lower = path.toLowerCase();
  if (BASELINE.some(p => p.toLowerCase() === lower)) return true;
  for (const r of roles) {
    const allowed = ROLE_ROUTES[r];
    if (!allowed) continue;
    if (allowed.includes("*")) return true;
    if (allowed.some(p => p.toLowerCase() === lower)) return true;
  }
  return false;
}
