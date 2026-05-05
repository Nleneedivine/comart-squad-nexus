import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/buy-stock")({
  head: () => ({ meta: [{ title: "Buy Stock — Comart+" }, { name: "description", content: "Record new stock purchases." }] }),
  component: () => <Placeholder title="Buy Stock" description="Record new stock purchases." />,
});
