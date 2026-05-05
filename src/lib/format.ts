export function formatNaira(amount: number): string {
  return "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(amount || 0);
}
