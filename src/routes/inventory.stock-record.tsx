import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/stock-record")({
  head: () => ({ meta: [{ title: "Stock Record — Comart+" }, { name: "description", content: "Stock movement history." }] }),
  component: () => <Placeholder title="Stock Record" description="Stock movement history." />,
});
