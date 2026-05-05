import { createFileRoute } from "@tanstack/react-router";
import Placeholder from "@/components/Placeholder";

export const Route = createFileRoute("/inventory/products")({
  head: () => ({ meta: [{ title: "Inventory Products — Comart+" }, { name: "description", content: "Inventory product list." }] }),
  component: () => <Placeholder title="Inventory Products" description="Inventory product list." />,
});
